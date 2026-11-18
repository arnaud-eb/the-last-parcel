import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { App, AppEvent, HudSnapshot } from '../app';
import { PARCEL_LABEL, PARCEL_RULES, parcelValue, type Parcel } from '../core/parcels';
import { Minimap } from './Minimap';
import { ParcelTray, TYPE_ICON } from './ParcelTray';

type Toast = { id: number; from?: string; text: string };

const THANKS = [
  'Merci villmols!', // Luxembourgish
  'Merci beaucoup !', // French
  'Vielen Dank!', // German
  'Muito obrigado!', // Portuguese
  'Thank you so much!',
];

export function mountUi(root: HTMLElement, app: App, opts: { debug: boolean }): void {
  render(<Ui app={app} debug={opts.debug} />, root);
}

function Ui({ app, debug }: { app: App; debug: boolean }) {
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [trayOpen, setTrayOpen] = useState(false);
  const markerRef = useRef<HTMLDivElement>(null);
  const last = useRef('');
  const nextId = useRef(1);

  const toast = (text: string, from?: string, ms = 3600) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, text, from }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  };

  useEffect(() => {
    const offHud = app.onHud((s) => {
      // Move the target marker every frame without re-rendering.
      const m = markerRef.current;
      if (m && s.target) {
        // On screen: on the door. Off screen: on an ellipse round the centre, clear of the HUD corners and pedals.
        const x = s.target.onScreen ? s.target.x : 50 + Math.cos(s.target.angle) * 36;
        const y = s.target.onScreen ? s.target.y : 50 + Math.sin(s.target.angle) * 26;
        m.style.left = `${x}%`;
        m.style.top = `${y}%`;
        const arrow = m.querySelector<HTMLElement>('.arrow');
        if (arrow) arrow.style.transform = `rotate(${s.target.angle}rad)`;
        m.dataset.on = String(s.target.onScreen);
      }
      // Re-render only when visible text changes.
      const key = [s.phase, s.clock, s.parcelsLeft, s.score, Math.round(s.handover * 20), s.target?.id, s.target ? Math.round(s.target.dist) : -1, s.target?.onScreen, debug ? `${s.debug.fps}${s.debug.drawCalls}` : ''].join('|');
      if (key !== last.current) {
        last.current = key;
        setHud(s);
      }
    });
    const offEv = app.on((e: AppEvent) => {
      if (e.type === 'started') {
        const n = app.game.parcels.length;
        toast(`Moien! ${n} parcel${n === 1 ? '' : 's'} left. Last run before Christmas Eve dinner. Merci and good luck.`, 'Dispatch', 4500);
      } else if (e.type === 'delivered') {
        navigator.vibrate?.(60);
        toast(deliveredText(e.parcel), e.parcel.stop.address);
      } else if (e.type === 'damaged') {
        toast(e.fragile ? `Ouch! Something fragile rattled.  −${e.penalty}` : `Ouch!  −${e.penalty}`, undefined, 1800);
      } else if (e.type === 'recovered') {
        toast(e.auto ? 'Back on the road. Careful on the ice!' : 'Back on the road.', undefined, 2200);
      } else if (e.type === 'hit') {
        navigator.vibrate?.(Math.min(80, 20 + e.strength * 6));
      }
    });
    return () => {
      offHud();
      offEv();
    };
  }, [app]);

  if (!hud) return <RotateHint />;
  const late = hud.minutesLeft < 20;

  return (
    <>
      <div class="hud-top">
        <div class={`panel clock${late ? ' late' : ''}`}>
          <div class="time" data-testid="clock">{hud.clock}</div>
          <div class="left">{formatLeft(hud.minutesLeft)} to the 6pm cutoff</div>
          <div class="bar"><i style={{ width: `${(1 - hud.progress) * 100}%` }} /></div>
        </div>
        <div class="stats">
          <button class={`panel stat tray-toggle${trayOpen ? ' open' : ''}`} data-testid="tray-toggle" aria-label="Choose the next stop" onClick={() => setTrayOpen(!trayOpen)}>
            <b data-testid="parcels">{hud.parcelsLeft}</b><span>parcels ▾</span>
          </button>
          <div class="panel stat"><b data-testid="score">{hud.score}</b><span>score</span></div>
          {hud.phase === 'driving' && (
            <button class="panel reset" data-testid="reset" aria-label="Put the van back on the road" title="Back on the road (R)" onClick={() => app.recover()}>↺</button>
          )}
        </div>
      </div>

      {hud.phase !== 'ended' && <Minimap app={app} />}
      {trayOpen && hud.phase !== 'ended' && <ParcelTray app={app} onPick={() => setTrayOpen(false)} />}

      {hud.target && hud.phase === 'driving' && (
        <div class="panel target-card" data-testid="target">
          <span>{TYPE_ICON[hud.target.type]} <span class="type">{PARCEL_LABEL[hud.target.type]}</span> {hud.target.address}</span>
          <span class="dist">{Math.round(hud.target.dist)} m</span>
        </div>
      )}

      <div ref={markerRef} class="marker" style={{ display: hud.target && hud.phase !== 'ended' ? 'block' : 'none' }}>
        {hud.target?.onScreen ? <div class="pin" /> : <div class="arrow" />}
      </div>

      {hud.handover > 0.02 && (
        <div class="handover">
          <svg viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="17" fill="rgba(10,17,38,.6)" stroke="rgba(255,255,255,.15)" stroke-width="4" />
            <circle cx="20" cy="20" r="17" fill="none" stroke="#ffb547" stroke-width="4" stroke-linecap="round" stroke-dasharray={`${hud.handover * 106.8} 106.8`} />
          </svg>
          <div class="label">📦</div>
        </div>
      )}

      <div class="toasts" style={{ display: hud.phase === 'ended' ? 'none' : undefined }}>
        {toasts.map((t) => (
          <div key={t.id} class="panel toast">
            {t.from && <span class="from">{t.from}</span>}
            {t.text}
          </div>
        ))}
      </div>

      <TouchControls app={app} />
      {hud.phase === 'driving' && <div class="panel keys-hint">↑ or W: go · ↓ or S: brake, then reverse · ← → or A D: steer · Tab: change stop · R: back on the road</div>}

      {hud.phase === 'ready' && !app.opts.test && (
        <div class="overlay" onPointerDown={() => app.start()}>
          <div class="panel card">
            <p>December 24 · 4:00pm · Luxembourg</p>
            <h1>The Last Parcel</h1>
            <p>The last Kuerier van of the year. Every present must arrive before Christmas Eve dinner at 6pm.</p>
            <button class="btn" onClick={() => app.start()}>Start shift</button>
          </div>
        </div>
      )}

      {hud.phase === 'ended' && <TallyCard app={app} />}

      {debug && (
        <div class="panel debug" data-testid="debug">
          {`${hud.debug.fps} fps  ${hud.debug.backend}\n${hud.debug.drawCalls} calls  ${(hud.debug.triangles / 1000).toFixed(0)}k tris\ntier ${hud.debug.tier} @ ${hud.debug.scale.toFixed(1)}`}
        </div>
      )}
      <RotateHint />
    </>
  );
}

function deliveredText(p: Parcel): string {
  const thanks = p.type === 'grandma' ? 'Merci, mäi Schatz! Oma is so happy.' : THANKS[Math.floor(Math.random() * THANKS.length)];
  let pts = parcelValue(p);
  if (p.type === 'grandma') pts += PARCEL_RULES.grandmaBonus;
  if (p.type === 'express' && (p.deliveredAt ?? 999) < PARCEL_RULES.expressBy) pts += PARCEL_RULES.expressBonus;
  if (p.type === 'fragile' && p.hits === 0) pts += PARCEL_RULES.fragileIntactBonus;
  const tip = p.tip && (p.deliveredAt ?? 999) <= PARCEL_RULES.tipBy && (p.type !== 'fragile' || p.hits === 0) ? `  (tip +${p.tip})` : '';
  return `${thanks}  +${pts}${tip}`;
}

const RANK_LINE: Record<string, string> = {
  'Missed the Sleigh': 'Some trees will be bare tonight. Tomorrow, the sleigh.',
  'On Time': 'Most of the town has its presents. Well driven.',
  'Christmas Hero': 'The whole old town is talking about the Kuerier van.',
};

function TallyCard({ app }: { app: App }) {
  const g = app.game;
  const t = g.tally;
  const all = t.delivered === t.total;
  return (
    <div class="overlay">
      <div class="panel card tally" data-testid="end-card">
        <p class="kicker">{all ? `All delivered at ${g.clock.format()}` : '6pm. Shift over.'}</p>
        <h2 data-testid="rank">{t.rank}</h2>
        <p>{RANK_LINE[t.rank]}</p>
        <table>
          <tbody>
            {t.lines.map((l) => (
              <tr key={l.label} class={l.points === 0 ? 'zero' : ''}>
                <td>{l.label}</td>
                <td>{l.points > 0 ? `+${l.points}` : l.points < 0 ? `−${-l.points}` : '0'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>Score</td><td class="big" data-testid="final-score">{t.score}</td></tr>
          </tfoot>
        </table>
        <p>{all ? 'Every parcel under a tree.' : `${t.total - t.delivered} of ${t.total} parcels won't be under the tree tonight.`} <b>Schéi Chrëschtdeeg!</b></p>
        <button class="btn" onClick={() => { app.restart(); app.start(); }}>Drive again</button>
      </div>
    </div>
  );
}

function formatLeft(min: number): string {
  const m = Math.max(0, Math.ceil(min));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`;
}

function RotateHint() {
  return (
    <div class="rotate">
      <div><span class="phone">📱</span>Turn your phone sideways to drive</div>
    </div>
  );
}

/** Left: drag to steer. Right: Gas and Brake/Reverse. Multi-touch safe. */
function TouchControls({ app }: { app: App }) {
  const [gas, setGas] = useState(false);
  const [brake, setBrake] = useState(false);
  const [steer, setSteer] = useState(0);
  const steerPointer = useRef<{ id: number; x0: number } | null>(null);
  const RANGE = 70; // px for full lock

  const setTouch = (patch: Partial<App['input']['touch']>) => Object.assign(app.input.touch, patch);

  const onSteerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    steerPointer.current = { id: e.pointerId, x0: e.clientX };
    if (app.game.phase === 'ready') app.start();
  };
  const onSteerMove = (e: PointerEvent) => {
    const s = steerPointer.current;
    if (!s || s.id !== e.pointerId) return;
    const v = Math.max(-1, Math.min(1, (e.clientX - s.x0) / RANGE));
    setTouch({ steer: v === 0 ? 0.0001 : v });
    setSteer(v);
  };
  const onSteerUp = (e: PointerEvent) => {
    if (steerPointer.current?.id !== e.pointerId) return;
    steerPointer.current = null;
    setTouch({ steer: 0 });
    setSteer(0);
  };
  const pedal = (which: 'gas' | 'brake', on: boolean) => {
    setTouch({ [which]: on });
    (which === 'gas' ? setGas : setBrake)(on);
    if (on && app.game.phase === 'ready') app.start();
  };

  return (
    <div class="touch">
      <div class="touch-zone steer" onPointerDown={onSteerDown} onPointerMove={onSteerMove} onPointerUp={onSteerUp} onPointerCancel={onSteerUp} />
      <div class="wheel panel">
        <span class="chev" style={{ left: '12px' }}>‹</span>
        <span class="chev" style={{ right: '12px' }}>›</span>
        <div class="knob" style={{ transform: `translateX(${steer * 38}px)` }} />
      </div>
      <div class="pedals">
        <button class={`pedal brake${brake ? ' on' : ''}`} onPointerDown={() => pedal('brake', true)} onPointerUp={() => pedal('brake', false)} onPointerCancel={() => pedal('brake', false)} onPointerLeave={() => pedal('brake', false)}>
          BRAKE
        </button>
        <button class={`pedal gas${gas ? ' on' : ''}`} onPointerDown={() => pedal('gas', true)} onPointerUp={() => pedal('gas', false)} onPointerCancel={() => pedal('gas', false)} onPointerLeave={() => pedal('gas', false)}>
          GAS
        </button>
      </div>
    </div>
  );
}
