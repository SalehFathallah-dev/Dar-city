export const APP = {
  name: 'DR. FARAJ LASHIKA – ORTHOPEDIC & SPORTS MEDICINE',
  product: 'Multi-Club Sports Medical Management System',
  physician: 'Dr. Faraj Lashika',
  specialty: 'Orthopedic & Sports Medicine',
} as const;

export const BRAND = {
  navy: '#142347',
  gold: '#9A7634',
  goldLight: '#C9A866',
  cream: '#F7F3EA',
  red: '#C0283A',
  white: '#FFFFFF',
} as const;

export type AppRole = 'super_admin' | 'team_physician' | 'assistant_medical_staff' | 'team_manager' | 'head_coach';

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Administrator',
  team_physician: 'Team Physician',
  assistant_medical_staff: 'Assistant Medical Staff',
  team_manager: 'Team Manager',
  head_coach: 'Head Coach',
};

export const POSITIONS = ['Point Guard', 'Shooting Guard', 'Small Forward', 'Power Forward', 'Center'] as const;
export const POSITION_ABBR: Record<string, string> = {
  'Point Guard': 'PG', 'Shooting Guard': 'SG', 'Small Forward': 'SF', 'Power Forward': 'PF', Center: 'C',
};
export const DOMINANT_HANDS = ['Right', 'Left', 'Both'] as const;
export const PLAYER_STATUSES = ['active', 'inactive', 'archived'] as const;

export const EXAM_TYPES = ['Pre-Season', 'Periodic', 'Post-Injury', 'Return-to-Play', 'Other'] as const;
export const SYSTEMATIC_REGIONS = [
  'General Examination', 'Cardiovascular Examination', 'Respiratory Examination',
  'Neurological Examination', 'Musculoskeletal Examination', 'Orthopedic Examination',
] as const;
export const ORTHOPEDIC_REGIONS = [
  'Cervical Spine', 'Thoracic Spine', 'Lumbar Spine', 'Shoulder Examination', 'Elbow Examination',
  'Wrist Examination', 'Hand Examination', 'Hip Examination', 'Knee Examination', 'Ankle Examination', 'Foot Examination',
] as const;
export const EXAM_CLEARANCE = [
  'Cleared for Full Participation', 'Cleared with Restrictions', 'Temporarily Not Cleared', 'Further Evaluation Required',
] as const;

export const INJURY_SETTINGS = ['Match', 'Training', 'Other'] as const;
export const CONTACT_TYPES = ['Contact', 'Non-Contact'] as const;
export const ONSET_TYPES = ['Acute', 'Overuse'] as const;
export const BODY_SIDES = ['Right', 'Left', 'Bilateral', 'Not Applicable'] as const;
export const BODY_REGIONS = [
  'Head', 'Neck', 'Shoulder', 'Upper Arm', 'Elbow', 'Forearm', 'Wrist', 'Hand', 'Fingers',
  'Thoracic Spine', 'Lumbar Spine', 'Hip', 'Groin', 'Thigh', 'Hamstring', 'Quadriceps', 'Knee',
  'Lower Leg', 'Calf', 'Achilles Tendon', 'Ankle', 'Foot', 'Toes',
] as const;
export const INJURY_TYPES = [
  'Muscle Strain', 'Ligament Sprain', 'Tendon Injury', 'Joint Injury', 'Fracture', 'Dislocation',
  'Contusion', 'Tendinopathy', 'Stress Injury', 'Overuse Injury', 'Other',
] as const;
export const SEVERITIES = ['Mild', 'Moderate', 'Severe', 'To Be Determined'] as const;
export const INJURY_STATUSES = [
  'Newly Recorded', 'Under Investigation', 'Under Treatment', 'Under Rehabilitation',
  'Modified Training', 'Return-to-Play Assessment', 'Recovered', 'Closed',
] as const;
export const OPEN_INJURY_STATUSES = INJURY_STATUSES.filter((s) => s !== 'Recovered' && s !== 'Closed');
export const MECHANISMS = [
  'Landing', 'Jumping', 'Cutting / Change of Direction', 'Sprinting', 'Collision with Player',
  'Contact with Ball', 'Fall', 'Blocked Shot / Hand Contact', 'Repetitive Loading', 'Twisting', 'Other',
] as const;

export const TREATMENT_TYPES = [
  'Initial Management', 'Medication', 'Ice / Cryotherapy', 'Compression', 'Immobilization',
  'PRP / Other Procedure', 'Physiotherapy', 'Rehabilitation', 'Referral', 'Other',
] as const;

export const SEVERITY_SCALE = ['None', 'Mild', 'Moderate', 'Severe'] as const;
export const TREATMENT_RESPONSES = ['Improving', 'Unchanged', 'Worsening', 'Resolved'] as const;

export const REHAB_PHASES = [
  'Acute Phase', 'Early Rehabilitation', 'Strengthening Phase', 'Functional Rehabilitation',
  'Sport-Specific Rehabilitation', 'Return-to-Training', 'Return-to-Competition',
] as const;
export const REHAB_STATUSES = ['Active', 'Completed', 'Discontinued'] as const;

export const RTP_DECISIONS = [
  'Not Cleared', 'Rehabilitation Required', 'Cleared for Modified Training', 'Cleared for Full Training', 'Cleared for Competition',
] as const;

export const AVAILABILITY = [
  'FULLY AVAILABLE', 'MODIFIED TRAINING', 'INDIVIDUAL TRAINING', 'NOT AVAILABLE', 'UNDER MEDICAL REVIEW',
] as const;
export const MEDICAL_STATUSES = [
  'Fit', 'Injured', 'Under Rehabilitation', 'Return-to-Play Phase', 'Illness', 'Awaiting Assessment', 'Clearance Pending',
] as const;

export const DOCUMENT_CATEGORIES = [
  'Medical Examination', 'Laboratory Results', 'X-Ray', 'MRI', 'Ultrasound',
  'Medical Certificates', 'Hospital Reports', 'Prescriptions', 'Other',
] as const;
export const ALLOWED_DOC_TYPES: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png',
};
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const CLEARED_STATUSES = ['Cleared for Full Participation', 'Cleared with Restrictions'];
