import { PARCEL_LABEL, PARCEL_RULES as R, type ParcelType } from '../core/parcels';
import { SCORING } from '../core/scoring';
import { ParcelIcon } from './ParcelIcon';

const TYPE_RULE: Record<ParcelType, string> = {
  standard: 'Deliver it any time before 6pm.',
  express: `+${R.expressBonus} if it arrives before 5pm.`,
  fragile: `Loses value every time you crash. +${R.fragileIntactBonus} if it arrives without a scratch.`,
  heavy: 'The van is slower to speed up and to stop until you deliver it.',
  grandma: `Down in Grund, at the foot of the cliff. +${R.grandmaBonus}.`,
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** How to play. Opened from the start card, the ? button while driving (the game pauses) and the tally. */
export function Rules({ onClose, closeLabel }: { onClose: () => void; closeLabel: string }) {
  return (
    <div class="overlay rules-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class="panel card rules" data-testid="rules" role="dialog" aria-label="How to play">
        <h2>How to play</h2>
        <p class="lead">It's 4pm on Christmas Eve. Deliver as many parcels as you can before the 6pm cutoff.</p>

        <h3>Delivering</h3>
        <ul>
          <li>Every parcel in your van has a <b>glowing ring</b> in front of its door, in the colour of its type.</li>
          <li><b>Stop inside any ring</b> and stay still for a second: the parcel is handed over.</li>
          <li>The ring with the <b>beam of light</b> is your next stop on a suggested route through the town. The yellow arrow and the minimap point to it.</li>
          <li>Tap the <b>parcels</b> counter (or press Tab) to see the route and choose another stop.</li>
        </ul>

        <h3>Parcels</h3>
        <ul class="types">
          {(Object.keys(TYPE_RULE) as ParcelType[]).map((t) => (
            <li key={t}>
              <ParcelIcon type={t} size={26} />
              <span><b>{PARCEL_LABEL[t]}</b> {TYPE_RULE[t]}</span>
            </li>
          ))}
        </ul>

        <h3>Points</h3>
        <ul>
          <li>Each parcel's value, plus its bonus.</li>
          <li><b>Tips</b> from some recipients, if you arrive by 5:30pm (fragile ones: intact).</li>
          <li><b>Streak:</b> deliveries less than {SCORING.streakSeconds} seconds apart earn more and more.</li>
          <li><b>Crashes</b> cost points.</li>
          <li>
            <b>Rank:</b> we compare your score with the best score you could get today. {pct(SCORING.ranks.hero)} or more: Christmas Hero.{' '}
            {pct(SCORING.ranks.onTime)} or more: On Time. Less: Missed the Sleigh.
          </li>
        </ul>

        <h3>Driving</h3>
        <ul>
          <li class="touch-only">Drag on the left of the screen to steer. Hold <b>GAS</b> to go, <b>BRAKE</b> to slow down; keep holding BRAKE once stopped to reverse.</li>
          <li class="keys-only">↑ or W to go, ↓ or S to brake then reverse, ← → or A D to steer.</li>
          <li>Stuck or on your side? Tap <b>↺</b> (or press R) to get back on the road.</li>
        </ul>

        <button class="btn" data-testid="rules-close" onClick={onClose}>{closeLabel}</button>
      </div>
    </div>
  );
}
