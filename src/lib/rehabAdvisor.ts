/**
 * Proposed treatment & rehabilitation protocol for an injury (decision support).
 * Evidence-informed, criteria-based progression for common basketball injuries.
 * It is a starting point for the physician – it never prescribes medication or doses,
 * never clears an athlete, and must be adapted to the clinical examination and imaging.
 */
import type { Injury } from './types';

export interface RehabPhase { phase: string; goals: string; exercises: string[]; criteria: string }
export interface RehabProposal {
  group: string; title: string; timeLoss: [number, number] | null; timeLossNote: string;
  initial: string[]; phases: RehabPhase[]; rtp: string[]; redFlags: string[]; notes: string[];
}

type Group = 'hamstring' | 'quadriceps' | 'groin' | 'calf' | 'ankle' | 'knee' | 'shoulder' | 'arm' | 'hand' | 'spine' | 'head' | 'general';
const GROUP_OF: Record<string, Group> = {
  Hamstring: 'hamstring', Thigh: 'quadriceps', Quadriceps: 'quadriceps', Groin: 'groin', Hip: 'groin',
  Calf: 'calf', 'Achilles Tendon': 'calf', 'Lower Leg': 'calf', Ankle: 'ankle', Foot: 'ankle', Toes: 'ankle', Knee: 'knee',
  Shoulder: 'shoulder', 'Upper Arm': 'shoulder', Elbow: 'arm', Forearm: 'arm', Wrist: 'hand', Hand: 'hand', Fingers: 'hand',
  'Lumbar Spine': 'spine', 'Thoracic Spine': 'spine', Neck: 'spine', Head: 'head',
};

type Sev = 'mild' | 'moderate' | 'severe';
function severityOf(i: Pick<Injury, 'severity' | 'injury_grade'>): Sev {
  const g = (i.injury_grade ?? '').toLowerCase();
  if (/3|iii|complete|rupture|severe/.test(g) || i.severity === 'Severe') return 'severe';
  if (/2|ii|partial|moderate/.test(g) || i.severity === 'Moderate') return 'moderate';
  return 'mild';
}

// Typical time-loss ranges in days (wide on purpose – individual courses vary a lot).
const TIME_LOSS: Record<string, Record<Sev, [number, number]>> = {
  'Muscle Strain': { mild: [7, 14], moderate: [21, 42], severe: [60, 120] },
  'Ligament Sprain': { mild: [7, 21], moderate: [21, 42], severe: [42, 84] },
  'Tendon Injury': { mild: [14, 42], moderate: [42, 84], severe: [120, 270] },
  Tendinopathy: { mild: [7, 28], moderate: [28, 84], severe: [84, 180] },
  'Joint Injury': { mild: [7, 21], moderate: [21, 56], severe: [56, 120] },
  Contusion: { mild: [3, 7], moderate: [7, 21], severe: [21, 42] },
  Fracture: { mild: [42, 70], moderate: [56, 98], severe: [84, 180] },
  Dislocation: { mild: [21, 42], moderate: [42, 84], severe: [90, 180] },
  'Stress Injury': { mild: [42, 70], moderate: [56, 112], severe: [90, 180] },
  'Overuse Injury': { mild: [7, 21], moderate: [21, 56], severe: [56, 120] },
};

const EX: Record<Group, string[][]> = {
  // index = phase 0..6
  hamstring: [
    ['Relative rest, pain-free walking', 'Pain-free submaximal isometric hamstring holds 5 × 30 s'],
    ['Isometrics at several knee angles', 'Bridges (double → single leg)', 'Stationary bike, easy', 'Walking progression'],
    ['Romanian deadlift (light → heavy)', 'Hip extension / long-lever bridges', 'Eccentric slider curls → Nordic hamstring curl (progressive)'],
    ['Running progression 50 → 70 → 85 % of max speed', 'A-skips, B-skips, accelerations', 'Single-leg balance and hopping'],
    ['Sprint progression to 95–100 %', 'Basketball cutting, deceleration and defensive slides', 'Plyometrics: bounding, repeated jumps'],
    ['Full team training with load monitoring', 'Maintain Nordic curls 1–2 ×/week'],
    ['Return to competition with planned minutes', 'Ongoing injury-prevention programme'],
  ],
  quadriceps: [
    ['Relative rest, pain-free walking', 'Quadriceps sets / isometric holds'],
    ['Straight-leg raises', 'Mini-squats', 'Stationary bike'],
    ['Leg press / split squats', 'Spanish squat', 'Reverse Nordic (progressive)'],
    ['Running progression', 'Lunges with rotation', 'Jump-landing technique'],
    ['Sprinting, jumping and shooting drills', 'Change of direction'],
    ['Full team training'], ['Return to competition'],
  ],
  groin: [
    ['Relative rest', 'Pain-free adductor squeeze isometrics (ball between knees)'],
    ['Copenhagen plank short lever', 'Bridges', 'Bike'],
    ['Copenhagen plank long lever', 'Lateral lunges', 'Hip strength (abduction/adduction, core)'],
    ['Running and lateral shuffles', 'Change-of-direction progression'],
    ['Defensive slides, cutting, explosive first step'], ['Full team training'], ['Return to competition'],
  ],
  calf: [
    ['Relative rest / walking boot if needed', 'Pain-free isometric calf raises'],
    ['Seated and standing calf raises (double leg)', 'Bike', 'Ankle mobility'],
    ['Single-leg calf raises (straight and bent knee), progressive load', 'Soleus strength'],
    ['Skipping, pogo jumps (low → high)', 'Running progression'],
    ['Jumping, landing, sprinting and cutting'], ['Full team training'], ['Return to competition'],
  ],
  ankle: [
    ['Protection (brace/taping), elevation, compression', 'Early weight-bearing as tolerated', 'Ankle pumps, range of motion'],
    ['Single-leg balance (eyes open → closed)', 'Theraband eversion/inversion', 'Calf raises', 'Bike'],
    ['Single-leg calf raises', 'Balance on unstable surface', 'Lateral band walks'],
    ['Hopping: forward, lateral, diagonal', 'Running and figure-of-8', 'Landing mechanics'],
    ['Cutting, jump-landing, defensive slides', 'Basketball drills with brace/tape'],
    ['Full team training with brace/tape'], ['Return to competition; continue balance programme 6–12 months'],
  ],
  knee: [
    ['Protection, compression, crutches if needed', 'Quadriceps activation', 'Knee range of motion (heel slides)'],
    ['Straight-leg raises', 'Mini-squats, step-ups', 'Bike', 'Hamstring curls'],
    ['Leg press, split squats, single-leg squat (controlled valgus)', 'Hip and core strength'],
    ['Running progression', 'Jump-landing technique (double → single leg)', 'Agility ladder'],
    ['Cutting, pivoting, contact drills', 'Hop test battery (aim LSI ≥ 90 %)'],
    ['Full team training'], ['Return to competition'],
  ],
  shoulder: [
    ['Sling briefly if needed', 'Pendulum and pain-free range of motion', 'Scapular setting'],
    ['Isometric rotator cuff', 'Active-assisted → active range of motion'],
    ['Band external/internal rotation', 'Scapular strengthening (rows, Y/T/W)', 'Closed-chain push-up progression'],
    ['Plyometric throws (ball)', 'Overhead strength', 'Shooting form progression'],
    ['Contact, rebounding and blocking drills'], ['Full team training'], ['Return to competition'],
  ],
  arm: [
    ['Protection, ice, range of motion as tolerated'], ['Isometrics, grip strength', 'Wrist/elbow mobility'],
    ['Progressive resistance (curls, extensions, pronation/supination)'], ['Ball-handling and passing drills'],
    ['Shooting and contact drills'], ['Full team training'], ['Return to competition'],
  ],
  hand: [
    ['Splint / buddy taping as indicated', 'Elevation, ice'], ['Gentle range of motion', 'Putty grip'],
    ['Grip and pinch strength', 'Wrist strengthening'], ['Ball-handling, catching, passing'],
    ['Shooting and contact with taping'], ['Full team training with taping'], ['Return to competition'],
  ],
  spine: [
    ['Relative rest, avoid bed rest', 'Walking', 'Positions of comfort'],
    ['Core activation (dead bug, bird dog)', 'Hip mobility', 'Bike'],
    ['Deadlift pattern, McGill big 3', 'Glute and hip strength'], ['Running, jumping, rotation'],
    ['Contact and landing drills'], ['Full team training'], ['Return to competition'],
  ],
  head: [[], [], [], [], [], [], []],
  general: [
    ['Protection, relative rest, pain-free movement'], ['Range of motion, isometrics', 'Bike'],
    ['Progressive resistance training'], ['Running, jumping, agility progression'],
    ['Basketball-specific drills'], ['Full team training'], ['Return to competition'],
  ],
};

const PHASES = ['Acute Phase', 'Early Rehabilitation', 'Strengthening Phase', 'Functional Rehabilitation', 'Sport-Specific Rehabilitation', 'Return-to-Training', 'Return-to-Competition'];
const GOALS = [
  'Protect the tissue, control pain and swelling, keep pain-free movement',
  'Restore range of motion and normal walking; start pain-free loading',
  'Restore strength (target ≥ 90 % of the other side) and tissue capacity',
  'Restore running, jumping and landing quality',
  'Restore basketball-specific speed, cutting and contact tolerance',
  'Full training without symptoms; rebuild training load progressively',
  'Return to competition with planned minutes and ongoing monitoring',
];
const CRITERIA = [
  'Pain ≤ 2/10 at rest and on walking; swelling controlled',
  'Full or near-full range of motion; pain-free daily activities',
  'Strength ≥ 80–90 % of the uninjured side; no pain during loading',
  'Pain-free running at high speed; good landing mechanics; hop tests ≥ 85–90 %',
  'Pain-free sport-specific drills at full intensity; no reaction next day',
  'Completed ≥ 1–2 weeks of full training; athlete confident',
  'Physician clearance after return-to-play assessment',
];

export function proposeRehab(i: Pick<Injury, 'body_region' | 'injury_type' | 'severity' | 'injury_grade' | 'body_side' | 'onset'>): RehabProposal {
  const group = GROUP_OF[i.body_region] ?? 'general';
  const sev = severityOf(i);
  const type = i.injury_type;
  const tl = TIME_LOSS[type]?.[sev] ?? null;
  const notes: string[] = [];
  const redFlags = [
    'Rapidly increasing swelling, deformity, or inability to bear weight → urgent imaging / specialist referral',
    'Numbness, tingling, weakness or circulation changes → neurovascular assessment',
    'Pain at rest or at night that does not settle, fever → reassess (infection, fracture, other pathology)',
    'No improvement after 1–2 weeks of appropriate rehabilitation → reassess diagnosis, consider imaging',
  ];

  if (group === 'head') {
    return {
      group, title: 'Suspected / confirmed concussion – graded return-to-sport', timeLoss: [7, 21],
      timeLossNote: 'Most adults recover in 10–14 days; each stage takes at least 24 h; return only after medical clearance.',
      initial: ['Remove from play immediately – no same-day return', 'Monitor 24–48 h; not alone the first night', 'Relative rest 24–48 h, then light activity that does not worsen symptoms', 'Avoid alcohol, driving and screens if they worsen symptoms'],
      phases: [
        { phase: 'Acute Phase', goals: 'Symptom-limited daily activity', exercises: ['Daily activities that do not provoke symptoms'], criteria: 'Symptoms improving' },
        { phase: 'Early Rehabilitation', goals: 'Light aerobic exercise', exercises: ['Walking or stationary bike, low intensity, no resistance'], criteria: 'No symptom increase for 24 h' },
        { phase: 'Functional Rehabilitation', goals: 'Sport-specific exercise', exercises: ['Running and shooting drills, no head impact'], criteria: 'No symptom increase for 24 h' },
        { phase: 'Sport-Specific Rehabilitation', goals: 'Non-contact training drills', exercises: ['Harder passing and team drills, resistance training'], criteria: 'Symptom-free; normal cognitive function' },
        { phase: 'Return-to-Training', goals: 'Full-contact practice', exercises: ['Full practice – only after medical clearance'], criteria: 'Physician clearance' },
        { phase: 'Return-to-Competition', goals: 'Return to play', exercises: ['Normal game play'], criteria: 'Completed all stages without symptoms' },
      ],
      rtp: ['Symptom-free at rest and with exertion', 'Normal cognitive / balance assessment', 'Completed each stage ≥ 24 h without symptoms', 'Written physician clearance'],
      redFlags: ['Worsening headache, repeated vomiting, seizure, deteriorating consciousness, unequal pupils, neck pain, weakness or numbness → emergency department immediately', ...redFlags.slice(3)],
      notes: ['Follows the international consensus graded return-to-sport strategy; adapt to the individual.'],
    };
  }

  const initial: string[] = [];
  if (i.onset !== 'Overuse' && !['Tendinopathy', 'Overuse Injury', 'Stress Injury'].includes(type)) {
    initial.push('PEACE: Protect 1–3 days, Elevate, Avoid anti-inflammatory modalities early unless the physician decides otherwise, Compress, Educate');
    initial.push('LOVE after the first days: progressive Load, Optimism, Vascularisation (pain-free cardio), Exercise');
    initial.push('Ice 15–20 min for pain relief as needed (avoid direct skin contact)');
  } else {
    initial.push('Load management: reduce aggravating activities (jumping volume, sprints) without complete rest');
    initial.push('Pain-monitoring model: pain ≤ 3–4/10 during exercise and settled by the next morning is acceptable');
  }
  if (type === 'Fracture' || type === 'Dislocation') {
    initial.unshift('Immobilise and refer for imaging / orthopaedic management; the protocol below starts after the orthopaedic decision');
    notes.push('Fracture/dislocation: phase progression depends on bone healing and the orthopaedic plan.');
  }
  if (group === 'knee' && type === 'Ligament Sprain' && sev !== 'mild') {
    redFlags.unshift('Pop, immediate swelling (haemarthrosis) or giving way → suspect ACL/meniscus injury: MRI and orthopaedic opinion');
    notes.push('A complete ACL rupture usually requires surgical opinion and 9–12 months of rehabilitation.');
  }
  if (group === 'ankle' && type === 'Ligament Sprain') notes.push('Apply the Ottawa ankle rules to decide on X-ray; consider high-ankle (syndesmosis) injury if pain is above the ankle joint.');
  if (group === 'calf' && /achilles/i.test(i.body_region) && sev === 'severe') redFlags.unshift('Positive Thompson test / palpable gap → suspected Achilles rupture: urgent orthopaedic referral');
  if (group === 'hamstring' && sev === 'severe') redFlags.unshift('Proximal tendon involvement or large haematoma → MRI and surgical opinion');
  if (type === 'Tendinopathy') notes.push('Tendinopathy: progress isometrics → heavy slow resistance → energy-storage (plyometrics); avoid complete rest.');

  const phases = PHASES.map((phase, idx) => ({ phase, goals: GOALS[idx], exercises: EX[group][idx], criteria: CRITERIA[idx] }));
  const startAt = sev === 'mild' && !['Fracture', 'Dislocation'].includes(type) ? 1 : 0;
  return {
    group, title: `${type} – ${i.body_region}${i.body_side && i.body_side !== 'Not Applicable' ? ` (${i.body_side})` : ''}, ${sev}`,
    timeLoss: tl, timeLossNote: tl ? 'Typical range for this injury type and severity – progression is criteria-based, not time-based.' : 'No typical range for this type – set after assessment.',
    initial, phases: phases.slice(startAt), rtp: [
      'Pain-free (0–1/10) during and after full training', 'Full range of motion', 'Strength ≥ 90 % of the uninjured side',
      'Functional / hop tests ≥ 90 % limb symmetry', 'Completed basketball-specific drills at full intensity', 'Tolerated ≥ 1–2 weeks of full training',
      'Psychological readiness (confidence)', 'Final decision and clearance by the team physician',
    ], redFlags, notes,
  };
}

/** Text for the rehabilitation programme form (goals / exercises / load). */
export function proposalToProgramme(p: RehabProposal) {
  return {
    current_phase: p.phases[0]?.phase ?? 'Acute Phase',
    goals: p.phases.map((ph) => `${ph.phase}: ${ph.goals}. Progress when: ${ph.criteria}.`).join('\n'),
    exercises: p.phases.filter((ph) => ph.exercises.length).map((ph) => `${ph.phase}:\n- ${ph.exercises.join('\n- ')}`).join('\n\n'),
    training_load: p.timeLoss ? `Typical time-loss ${p.timeLoss[0]}–${p.timeLoss[1]} days (criteria-based progression)` : 'Criteria-based progression',
  };
}
