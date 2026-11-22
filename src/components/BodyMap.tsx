import clsx from 'clsx';
import type { BodyLocation } from '../lib/types';

/**
 * Clickable anatomical body map (anterior + posterior). Several locations can be selected.
 * Front view: the athlete faces the viewer, so the athlete's RIGHT side is on the viewer's left.
 * Back view: seen from behind, so the athlete's RIGHT side is on the viewer's right.
 */
type Shape = { kind: 'circle'; cx: number; cy: number; r: number } | { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number } | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };
interface Zone { view: 'front' | 'back'; region: string; side: 'Left' | 'Right' | 'Center'; ar: string; shape: Shape }

const AR: Record<string, string> = {
  Head: 'الرأس', Neck: 'الرقبة', Shoulder: 'الكتف', Chest: 'الصدر', Abdomen: 'البطن', 'Upper Arm': 'العضد', Elbow: 'المرفق', Forearm: 'الساعد',
  'Wrist / Hand': 'الرسغ / اليد', 'Hip / Groin': 'الورك / الفخذ الداخلي', 'Thigh (front)': 'الفخذ الأمامي', Knee: 'الركبة', 'Shin / Lower Leg': 'الساق',
  Ankle: 'الكاحل', Foot: 'القدم', 'Upper Back': 'أعلى الظهر', 'Lower Back': 'أسفل الظهر', Buttock: 'الأرداف', Hamstring: 'العضلة الخلفية للفخذ',
  'Back of Knee': 'خلف الركبة', Calf: 'السمانة', 'Achilles Tendon': 'وتر أخيل', Heel: 'الكعب',
};
const SIDE_AR: Record<string, string> = { Left: 'يسار', Right: 'يمين', Center: '' };
export const locationLabel = (l: BodyLocation, lang: 'ar' | 'en' = 'en') =>
  lang === 'ar' ? [AR[l.region] ?? l.region, l.side && l.side !== 'Center' ? SIDE_AR[l.side] : ''].filter(Boolean).join(' ')
    : [l.side && l.side !== 'Center' ? l.side : '', l.region].filter(Boolean).join(' ');

function pair(view: 'front' | 'back', region: string, viewerLeft: Shape, viewerRight: Shape): Zone[] {
  // front: viewer-left = athlete's Right; back: viewer-left = athlete's Left
  const leftSide = view === 'front' ? 'Right' : 'Left';
  const rightSide = view === 'front' ? 'Left' : 'Right';
  return [{ view, region, side: leftSide, ar: AR[region], shape: viewerLeft }, { view, region, side: rightSide, ar: AR[region], shape: viewerRight }];
}
const mirror = (s: Shape): Shape => (s.kind === 'rect' ? { ...s, x: 200 - s.x - s.w } : { ...s, cx: 200 - s.cx });
function limbs(view: 'front' | 'back', parts: [string, Shape][]): Zone[] {
  return parts.flatMap(([region, shape]) => pair(view, region, shape, mirror(shape)));
}
const common = (view: 'front' | 'back'): Zone[] => [
  { view, region: 'Head', side: 'Center', ar: AR.Head, shape: { kind: 'circle', cx: 100, cy: 30, r: 20 } },
  { view, region: 'Neck', side: 'Center', ar: AR.Neck, shape: { kind: 'rect', x: 91, y: 50, w: 18, h: 13, rx: 3 } },
  ...limbs(view, [
    ['Shoulder', { kind: 'circle', cx: 62, cy: 74, r: 12 }],
    ['Upper Arm', { kind: 'rect', x: 46, y: 86, w: 16, h: 54, rx: 7 }],
    ['Elbow', { kind: 'circle', cx: 54, cy: 148, r: 8 }],
    ['Forearm', { kind: 'rect', x: 44, y: 156, w: 15, h: 50, rx: 7 }],
    ['Wrist / Hand', { kind: 'ellipse', cx: 50, cy: 220, rx: 9, ry: 13 }],
  ]),
];
const ZONES: Zone[] = [
  ...common('front'),
  { view: 'front', region: 'Chest', side: 'Center', ar: AR.Chest, shape: { kind: 'rect', x: 72, y: 64, w: 56, h: 54, rx: 10 } },
  { view: 'front', region: 'Abdomen', side: 'Center', ar: AR.Abdomen, shape: { kind: 'rect', x: 74, y: 120, w: 52, h: 48, rx: 8 } },
  ...limbs('front', [
    ['Hip / Groin', { kind: 'rect', x: 73, y: 170, w: 26, h: 28, rx: 6 }],
    ['Thigh (front)', { kind: 'rect', x: 73, y: 200, w: 25, h: 74, rx: 10 }],
    ['Knee', { kind: 'circle', cx: 86, cy: 285, r: 11 }],
    ['Shin / Lower Leg', { kind: 'rect', x: 77, y: 297, w: 18, h: 62, rx: 8 }],
    ['Ankle', { kind: 'circle', cx: 86, cy: 367, r: 7 }],
    ['Foot', { kind: 'ellipse', cx: 84, cy: 384, rx: 12, ry: 8 }],
  ]),
  ...common('back'),
  { view: 'back', region: 'Upper Back', side: 'Center', ar: AR['Upper Back'], shape: { kind: 'rect', x: 72, y: 64, w: 56, h: 60, rx: 10 } },
  { view: 'back', region: 'Lower Back', side: 'Center', ar: AR['Lower Back'], shape: { kind: 'rect', x: 74, y: 126, w: 52, h: 42, rx: 8 } },
  ...limbs('back', [
    ['Buttock', { kind: 'rect', x: 73, y: 170, w: 26, h: 30, rx: 10 }],
    ['Hamstring', { kind: 'rect', x: 73, y: 202, w: 25, h: 72, rx: 10 }],
    ['Back of Knee', { kind: 'circle', cx: 86, cy: 285, r: 11 }],
    ['Calf', { kind: 'rect', x: 77, y: 297, w: 18, h: 52, rx: 8 }],
    ['Achilles Tendon', { kind: 'rect', x: 81, y: 351, w: 10, h: 16, rx: 4 }],
    ['Heel', { kind: 'ellipse', cx: 86, cy: 380, rx: 9, ry: 9 }],
  ]),
];

const same = (a: BodyLocation, z: Zone) => a.view === z.view && a.region === z.region && (a.side ?? 'Center') === z.side;

function ShapeEl({ s, ...rest }: { s: Shape } & React.SVGProps<SVGElement>) {
  if (s.kind === 'circle') return <circle cx={s.cx} cy={s.cy} r={s.r} {...(rest as React.SVGProps<SVGCircleElement>)} />;
  if (s.kind === 'ellipse') return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...(rest as React.SVGProps<SVGEllipseElement>)} />;
  return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx ?? 0} {...(rest as React.SVGProps<SVGRectElement>)} />;
}

export function BodyMap({ value, onChange, readOnly, lang = 'ar' }: { value: BodyLocation[]; onChange?: (v: BodyLocation[]) => void; readOnly?: boolean; lang?: 'ar' | 'en' }) {
  const toggle = (z: Zone) => {
    if (readOnly || !onChange) return;
    const exists = value.some((v) => same(v, z));
    onChange(exists ? value.filter((v) => !same(v, z)) : [...value, { region: z.region, side: z.side, view: z.view }]);
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-2" dir="ltr">
        {(['front', 'back'] as const).map((view) => (
          <div key={view} className="rounded-xl bg-neutral-50 p-1 text-center">
            <p className="text-xs font-bold text-neutral-500">{view === 'front' ? (lang === 'ar' ? 'الأمام' : 'Front') : (lang === 'ar' ? 'الخلف' : 'Back')}</p>
            <svg viewBox="0 0 200 400" className="mx-auto h-72 w-auto touch-manipulation" role="group" aria-label={view === 'front' ? 'Front body map' : 'Back body map'}>
              {ZONES.filter((z) => z.view === view).map((z) => {
                const on = value.some((v) => same(v, z));
                const label = `${lang === 'ar' ? z.ar : z.region}${z.side !== 'Center' ? ` – ${lang === 'ar' ? SIDE_AR[z.side] : z.side}` : ''}`;
                return (
                  <ShapeEl key={`${z.region}-${z.side}`} s={z.shape} onClick={() => toggle(z)}
                    className={clsx('stroke-white transition', readOnly ? '' : 'cursor-pointer', on ? 'fill-brand-red' : 'fill-sky-200 hover:fill-sky-300')}
                    strokeWidth={2} role={readOnly ? undefined : 'button'} aria-label={label} aria-pressed={on}>
                    <title>{label}</title>
                  </ShapeEl>
                );
              })}
              <text x="8" y="396" fontSize="11" fill="#94a3b8">{view === 'front' ? (lang === 'ar' ? 'يمين' : 'R') : (lang === 'ar' ? 'يسار' : 'L')}</text>
              <text x="192" y="396" fontSize="11" fill="#94a3b8" textAnchor="end">{view === 'front' ? (lang === 'ar' ? 'يسار' : 'L') : (lang === 'ar' ? 'يمين' : 'R')}</text>
            </svg>
          </div>
        ))}
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {value.map((v, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-brand-red">
              {locationLabel(v, lang)}
              {!readOnly && onChange && <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="remove">×</button>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
