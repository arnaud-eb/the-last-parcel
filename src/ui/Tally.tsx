import { useEffect, useRef, useState } from 'preact/hooks';
import type { App } from '../app';
import { PARCEL_COLOR } from '../core/parcels';
import { SCORING, type Rank } from '../core/scoring';
import { enterFullscreen } from './device';

type Mood = 'hero' | 'ontime' | 'missed';

const MOOD: Record<Rank, Mood> = { 'Christmas Hero': 'hero', 'On Time': 'ontime', 'Missed the Sleigh': 'missed' };

const LINE: Record<Mood, { title: string; text: string }> = {
  hero: { title: 'Christmas Hero!', text: 'The whole old town is talking about the courier van.' },
  ontime: { title: 'On Time', text: 'Most of the town has its presents. Well driven!' },
  missed: { title: 'Missed the Sleigh', text: "Some trees will be bare tonight. Tomorrow there's a new route." },
};

const CONFETTI_COLORS = [...Object.values(PARCEL_COLOR), '#ffffff'];

/** End-of-shift tally: line items, score counting up, rank, in a style that matches the rank. */
export function Tally({ app, onRules }: { app: App; onRules: () => void }) {
  const g = app.game;
  const t = g.tally;
  const mood = MOOD[t.rank];
  const all = t.delivered === t.total;
  const shown = useCountUp(t.score, mood === 'missed' ? 700 : 1400);
  const share = Math.min(1, t.score / (t.best || 1));
  const spare = Math.max(0, Math.floor(120 - g.clock.minutes));

  useEffect(() => {
    if (mood === 'hero') navigator.vibrate?.([60, 50, 60, 50, 160]);
    else if (mood === 'ontime') navigator.vibrate?.([60, 50, 100]);
  }, []);

  return (
    <div class={`overlay tally-overlay ${mood}`}>
      {mood === 'hero' && <div class="rays" />}
      {mood !== 'missed' && <Confetti count={mood === 'hero' ? 48 : 14} stars={mood === 'ontime'} />}
      <div class={`panel card tally ${mood}`} data-testid="end-card" data-mood={mood}>
        <div class="head">
        <p class="kicker">
          {all ? `All ${t.total} delivered at ${g.clock.format()}${spare > 0 ? ` · ${spare} min to spare` : ''}` : `6pm. Shift over · ${t.delivered} of ${t.total} delivered`}
        </p>
        <h2 class="title">{LINE[mood].title}</h2>
        <span class="sr" data-testid="rank">{t.rank}</span>
        <p>{LINE[mood].text}</p>

        <div class="ladder" aria-hidden="true">
          <div class="track">
            <i class="fill" style={{ width: `${share * 100}%` }} />
            <b style={{ left: `${SCORING.ranks.onTime * 100}%` }} />
            <b style={{ left: `${SCORING.ranks.hero * 100}%` }} />
          </div>
          <div class="labels">
            <span class={mood === 'missed' ? 'on' : ''} style={{ left: `${(SCORING.ranks.onTime / 2) * 100}%` }}>Missed the Sleigh</span>
            <span class={mood === 'ontime' ? 'on' : ''} style={{ left: `${((SCORING.ranks.onTime + SCORING.ranks.hero) / 2) * 100}%` }}>On Time</span>
            <span class={mood === 'hero' ? 'on' : ''} style={{ left: `${((SCORING.ranks.hero + 1) / 2) * 100}%` }}>Hero</span>
          </div>
        </div>
        </div>

        <table class="lines">
          <tbody>
            {t.lines.map((l) => (
              <tr key={l.label} class={l.points === 0 ? 'zero' : ''}>
                <td>{l.label}</td>
                <td>{l.points > 0 ? `+${l.points}` : l.points < 0 ? `−${-l.points}` : '0'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Score</td>
              <td class="big">{shown}<span class="sr" data-testid="final-score">{t.score}</span></td>
            </tr>
            <tr class="best"><td>Best possible today</td><td>{t.best}</td></tr>
          </tfoot>
        </table>
        <div class="foot">
          <p class="wish"><b>Merry Christmas!</b></p>
          <button class="btn" onClick={() => { if (!app.opts.test) void enterFullscreen(); app.restart(); app.start(); }}>Drive again</button>
          <button class="link" onClick={onRules}>How scoring works</button>
        </div>
      </div>
    </div>
  );
}

/** Animate a number from 0 to `to`. */
function useCountUp(to: number, ms: number): number {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [to, ms]);
  return v;
}

/** CSS-only falling confetti (or twinkling stars), placed by index so it's the same every time. */
function Confetti({ count, stars }: { count: number; stars: boolean }) {
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const f = (i * 0.618034) % 1; // golden-ratio spread across the screen
    const style = {
      left: `${(f * 100).toFixed(1)}%`,
      background: stars ? undefined : CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      animationDelay: `${((i * 0.37) % 2.4).toFixed(2)}s`,
      animationDuration: `${(stars ? 2.2 : 3.2) + ((i * 0.53) % 1.8)}s`,
      '--spin': `${(i % 2 ? 1 : -1) * (360 + (i * 47) % 360)}deg`,
      top: stars ? `${((i * 0.414) % 1) * 70 + 5}%` : undefined,
    };
    pieces.push(<i key={i} class={stars ? 'star' : 'confetti'} style={style} />);
  }
  return <div class="confetti-layer" aria-hidden="true">{pieces}</div>;
}
