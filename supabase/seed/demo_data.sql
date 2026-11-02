-- =====================================================================
-- DEMO DATA – FICTIONAL PLAYERS FOR TESTING ONLY
-- Every record is flagged is_demo = true and player names start with "DEMO".
-- Do NOT run this on a production database holding real medical records
-- without explicit confirmation. Remove with supabase/seed/remove_demo_data.sql
-- =====================================================================
begin;

insert into public.team_seasons (id, name, start_date, end_date, is_current, notes)
values ('00000000-0000-4000-8000-00000000a001', '2026/2027', '2026-09-01', '2027-06-30', true, 'DEMO season')
on conflict (name) do nothing;

insert into public.players (id, full_name, date_of_birth, nationality, phone, email, address, jersey_number, position,
  height_cm, weight_kg, dominant_hand, team_category, registration_date, season_id, status, is_demo)
values
 ('00000000-0000-4000-8000-0000000000d1','DEMO Juma Mwakalinga','1999-04-12','Tanzanian','+255 700 000 001','demo.juma@example.com','DEMO – Mikocheni, Dar es Salaam',3,'Point Guard',185,80,'Right','Senior Men','2026-09-01','00000000-0000-4000-8000-00000000a001','active',true),
 ('00000000-0000-4000-8000-0000000000d2','DEMO Baraka Kimaro','2000-08-21','Tanzanian','+255 700 000 002','demo.baraka@example.com','DEMO – Sinza, Dar es Salaam',7,'Shooting Guard',192,86,'Left','Senior Men','2026-09-01','00000000-0000-4000-8000-00000000a001','active',true),
 ('00000000-0000-4000-8000-0000000000d3','DEMO Emmanuel Okello','1997-02-03','Ugandan','+255 700 000 003','demo.emmanuel@example.com','DEMO – Masaki, Dar es Salaam',11,'Small Forward',198,94,'Right','Senior Men','2026-09-01','00000000-0000-4000-8000-00000000a001','active',true),
 ('00000000-0000-4000-8000-0000000000d4','DEMO Hamisi Said','1998-11-30','Tanzanian','+255 700 000 004','demo.hamisi@example.com','DEMO – Kinondoni, Dar es Salaam',21,'Power Forward',203,102,'Right','Senior Men','2026-09-01','00000000-0000-4000-8000-00000000a001','active',true),
 ('00000000-0000-4000-8000-0000000000d5','DEMO Daniel Mushi','1996-06-15','Tanzanian','+255 700 000 005','demo.daniel@example.com','DEMO – Upanga, Dar es Salaam',33,'Center',211,112,'Both','Senior Men','2026-09-01','00000000-0000-4000-8000-00000000a001','active',true);

insert into public.player_emergency_contacts (player_id, contact_name, relationship, phone)
select id, 'DEMO Contact for ' || replace(full_name, 'DEMO ', ''), 'Parent', '+255 711 000 00' || right(id::text, 1)
  from public.players where is_demo;

insert into public.medical_histories (player_id, previous_conditions, chronic_diseases, previous_injuries, previous_surgeries,
  drug_allergies, food_allergies, current_medications, previous_hospitalizations, family_history, relevant_information, physician_notes, change_reason)
values
 ('00000000-0000-4000-8000-0000000000d1','Malaria (2019), treated','None','Left ankle sprain 2022','None','None known','None known','None','None','No family history of sudden cardiac death','DEMO record','DEMO – fit for screening','Initial record'),
 ('00000000-0000-4000-8000-0000000000d2','Childhood asthma, resolved','None','None','None','Penicillin – rash','None known','None','None','Father – hypertension','DEMO record','DEMO – document penicillin allergy on all prescriptions','Initial record'),
 ('00000000-0000-4000-8000-0000000000d3','None','None','Right hamstring strain 2024','None','None known','Peanuts – mild','None','None','Non-contributory','DEMO record','DEMO record','Initial record'),
 ('00000000-0000-4000-8000-0000000000d4','None','None','Bilateral anterior knee pain (2025)','None','None known','None known','None','None','Mother – type 2 diabetes','DEMO record','DEMO – monitor patellar tendon load','Initial record'),
 ('00000000-0000-4000-8000-0000000000d5','None','None','Right 4th finger fracture 2021','Right 4th finger K-wire fixation 2021','None known','None known','None','2021 – finger surgery (day case)','Non-contributory','DEMO record','DEMO record','Initial record');

-- Pre-season examinations (clearance recorded by the physician)
insert into public.medical_examinations (id, player_id, season_id, examination_date, physician_name, examination_type,
  bp_systolic, bp_diastolic, heart_rate, respiratory_rate, temperature_c, oxygen_saturation, height_cm, weight_kg,
  laboratory_tests, ecg, clinical_summary, identified_problems, recommendations, follow_up_date,
  clearance_status, clearance_restrictions, physician_signature, signed_at, is_demo)
values
 ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-00000000a001','2026-09-03','Dr. Faraj Lashika','Pre-Season',118,74,56,14,36.6,99,185,80,'FBC, malaria RDT – normal','Sinus bradycardia, athlete-related changes only','DEMO – Normal pre-season examination','None','Routine periodic review','2027-01-15','Cleared for Full Participation',null,'Dr. Faraj Lashika',now(),true),
 ('00000000-0000-4000-8000-0000000000e2','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-00000000a001','2026-09-03','Dr. Faraj Lashika','Pre-Season',122,78,60,14,36.7,99,192,86,'FBC normal','Normal','DEMO – Normal examination; penicillin allergy noted','Drug allergy (penicillin)','Allergy alert on file','2027-01-15','Cleared for Full Participation',null,'Dr. Faraj Lashika',now(),true),
 ('00000000-0000-4000-8000-0000000000e3','00000000-0000-4000-8000-0000000000d3','00000000-0000-4000-8000-00000000a001','2026-09-04','Dr. Faraj Lashika','Pre-Season',116,72,52,12,36.5,98,198,94,'FBC normal','Normal','DEMO – Normal examination','Previous hamstring strain','Hamstring eccentric programme','2027-01-15','Cleared for Full Participation',null,'Dr. Faraj Lashika',now(),true),
 ('00000000-0000-4000-8000-0000000000e4','00000000-0000-4000-8000-0000000000d4','00000000-0000-4000-8000-00000000a001','2026-09-04','Dr. Faraj Lashika','Pre-Season',128,80,62,14,36.8,98,203,102,'FBC normal, HbA1c 5.3%','Normal','DEMO – Bilateral patellar tendon tenderness, otherwise normal','Patellar tendinopathy (bilateral)','Load management, isometric programme','2026-10-15','Cleared with Restrictions','Limit consecutive high-volume jumping sessions','Dr. Faraj Lashika',now(),true),
 ('00000000-0000-4000-8000-0000000000e5','00000000-0000-4000-8000-0000000000d5','00000000-0000-4000-8000-00000000a001','2026-09-05','Dr. Faraj Lashika','Pre-Season',124,76,58,14,36.6,99,211,112,'FBC normal','Normal (Echo not required)','DEMO – Normal examination','None','Routine','2027-01-15','Cleared for Full Participation',null,'Dr. Faraj Lashika',now(),true);

insert into public.examination_findings (examination_id, category, region, is_normal, clinical_findings, pain, range_of_motion, muscle_strength, joint_stability, special_tests)
select e.id, f.category, f.region, f.is_normal, f.findings, f.pain, f.rom, f.strength, f.stability, f.tests
  from public.medical_examinations e
  cross join (values
    ('Systematic','General Examination',true,'Well, no pallor/jaundice',null,null,null,null,null),
    ('Systematic','Cardiovascular Examination',true,'Normal heart sounds, no murmurs',null,null,null,null,null),
    ('Systematic','Respiratory Examination',true,'Clear chest',null,null,null,null,null),
    ('Orthopedic','Knee Examination',true,'No effusion','None','Full','5/5','Stable','Lachman negative'),
    ('Orthopedic','Ankle Examination',true,'No swelling','None','Full','5/5','Stable','Anterior drawer negative')
  ) as f(category, region, is_normal, findings, pain, rom, strength, stability, tests)
 where e.is_demo and e.id <> '00000000-0000-4000-8000-0000000000e4';

insert into public.examination_findings (examination_id, category, region, is_normal, clinical_findings, pain, range_of_motion, muscle_strength, joint_stability, special_tests) values
 ('00000000-0000-4000-8000-0000000000e4','Systematic','General Examination',true,'Well',null,null,null,null,null),
 ('00000000-0000-4000-8000-0000000000e4','Systematic','Cardiovascular Examination',true,'Normal',null,null,null,null,null),
 ('00000000-0000-4000-8000-0000000000e4','Orthopedic','Knee Examination',false,'Tenderness inferior pole of patella bilaterally','3/10 on single-leg decline squat','Full','5/5','Stable','Single-leg decline squat painful');

-- Injuries
insert into public.injuries (id, player_id, season_id, injury_date, injury_time, setting, match_opponent, training_session, mechanism,
  contact_type, onset, body_region, body_side, injury_type, anatomical_structure, diagnosis, severity, injury_grade,
  clinical_examination, special_tests, imaging_results, physician_assessment, status, is_recurrent, expected_return_date, return_to_play_date, is_demo)
values
 ('00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-00000000a001','2026-10-04','19:40','Match','DEMO Opponent A',null,'Inversion on landing after rebound',
  'Non-Contact','Acute','Ankle','Right','Ligament Sprain','Anterior talofibular ligament','Lateral ankle sprain – ATFL','Moderate','Grade II',
  'Swelling and ecchymosis lateral ankle, tender over ATFL','Anterior drawer mildly positive; Ottawa rules negative','X-ray: no fracture','DEMO – Grade II ATFL sprain','Under Rehabilitation',false,'2026-11-08',null,true),
 ('00000000-0000-4000-8000-0000000000f2','00000000-0000-4000-8000-0000000000d4','00000000-0000-4000-8000-00000000a001','2026-09-20','10:15','Training',null,'Morning plyometrics','Repetitive jumping load',
  'Non-Contact','Overuse','Knee','Bilateral','Tendinopathy','Patellar tendon','Patellar tendinopathy','Mild','N/A',
  'Tender inferior pole patella','Single-leg decline squat painful','Ultrasound: mild tendon thickening','DEMO – Reactive tendinopathy','Modified Training',true,'2026-11-20',null,true),
 ('00000000-0000-4000-8000-0000000000f3','00000000-0000-4000-8000-0000000000d3','00000000-0000-4000-8000-00000000a001','2026-09-15','17:30','Training',null,'Speed session','Sprinting – late swing phase',
  'Non-Contact','Acute','Hamstring','Right','Muscle Strain','Biceps femoris long head','Hamstring strain','Mild','Grade 1',
  'Tender mid-belly, pain on resisted knee flexion','Active knee extension test −10° vs left','Not required','DEMO – Grade 1 strain','Closed',true,'2026-09-29','2026-09-29',true),
 ('00000000-0000-4000-8000-0000000000f4','00000000-0000-4000-8000-0000000000d5','00000000-0000-4000-8000-00000000a001','2026-10-18','20:05','Match','DEMO Opponent B',null,'Ball impact to finger tip',
  'Contact','Acute','Fingers','Left','Dislocation','PIP joint, left 4th finger','Dorsal PIP dislocation, reduced','Moderate','N/A',
  'Deformity reduced on court; post-reduction stable','Collateral stress test stable','X-ray post-reduction: congruent, no fracture','DEMO – Reduced PIP dislocation','Under Treatment',false,'2026-11-05',null,true),
 ('00000000-0000-4000-8000-0000000000f5','00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-00000000a001','2026-10-25','18:50','Match','DEMO Opponent C',null,'Knee-to-thigh collision',
  'Contact','Acute','Thigh','Left','Contusion','Vastus lateralis','Quadriceps contusion','Mild','Grade 1',
  'Tender anterolateral thigh, knee flexion 120°','None','Not required','DEMO – Mild contusion','Recovered',false,'2026-10-28','2026-10-28',true);

insert into public.treatments (injury_id, treatment_date, treatment_type, details, medication_name, dosage, provided_by) values
 ('00000000-0000-4000-8000-0000000000f1','2026-10-04','Initial Management','PRICE protocol on court',null,null,'Dr. Faraj Lashika'),
 ('00000000-0000-4000-8000-0000000000f1','2026-10-04','Ice / Cryotherapy','15 min every 2 h for 48 h',null,null,'Dr. Faraj Lashika'),
 ('00000000-0000-4000-8000-0000000000f1','2026-10-04','Compression','Elastic compression bandage',null,null,'Dr. Faraj Lashika'),
 ('00000000-0000-4000-8000-0000000000f1','2026-10-05','Medication','Analgesia','Paracetamol','1 g TDS for 3 days','Dr. Faraj Lashika'),
 ('00000000-0000-4000-8000-0000000000f2','2026-09-21','Physiotherapy','Isometric quadriceps loading',null,null,'DEMO Physiotherapist'),
 ('00000000-0000-4000-8000-0000000000f3','2026-09-15','Initial Management','Relative rest, ice',null,null,'Dr. Faraj Lashika'),
 ('00000000-0000-4000-8000-0000000000f4','2026-10-18','Immobilization','Buddy strapping + dorsal block splint',null,null,'Dr. Faraj Lashika'),
 ('00000000-0000-4000-8000-0000000000f5','2026-10-25','Ice / Cryotherapy','Ice in knee flexion 20 min',null,null,'Dr. Faraj Lashika');

insert into public.injury_followups (injury_id, followup_date, pain_score, swelling, tenderness, range_of_motion, muscle_strength, functional_status,
  clinical_findings, treatment_provided, response_to_treatment, progress_assessment, next_followup_date, physician_notes) values
 ('00000000-0000-4000-8000-0000000000f1','2026-10-07',6,'Moderate','Moderate','DF 5°, PF 30°','4/5 eversion','Partial weight bearing','Reduced swelling','Compression, ROM exercises','Improving','Progressing as expected','2026-10-14','DEMO'),
 ('00000000-0000-4000-8000-0000000000f1','2026-10-14',3,'Mild','Mild','DF 10°, PF 40°','4+/5 eversion','Full weight bearing, walking without limp','Mild residual swelling','Balance training started','Improving','Good progress','2026-10-28','DEMO'),
 ('00000000-0000-4000-8000-0000000000f1','2026-10-28',1,'None','Mild','Full','5/5','Jogging pain-free; hop test 85% LSI','Minimal tenderness ATFL','Sport-specific drills','Improving','Not yet ready for full training','2026-11-04','DEMO'),
 ('00000000-0000-4000-8000-0000000000f2','2026-10-05',3,'None','Mild','Full','5/5','Training with modified jumping volume','Tender inferior pole','Isometrics, load modification','Improving','Stable','2026-11-05','DEMO'),
 ('00000000-0000-4000-8000-0000000000f3','2026-09-22',2,'None','Mild','AKE −3°','4+/5','Running at 70%','Minimal tenderness','Eccentric loading','Improving','Good','2026-09-29','DEMO'),
 ('00000000-0000-4000-8000-0000000000f4','2026-10-25',3,'Mild','Mild','PIP 0–80°','Grip 80%','Ball handling with buddy strapping','Stable joint','Splint weaned','Improving','Progressing','2026-11-04','DEMO');

insert into public.rehabilitation_programs (id, injury_id, player_id, start_date, current_phase, phase_approved_by, phase_approved_at, goals, exercises, training_load, physician_review, status, is_demo) values
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000d2','2026-10-06','Sport-Specific Rehabilitation','Dr. Faraj Lashika',now(),
  'Restore full ROM, strength and proprioception; return to competition','Calf raises, band eversion, single-leg balance, hop progression, cutting drills','Progressive – RPE ≤ 6','DEMO – progressing well','Active',true),
 ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000f2','00000000-0000-4000-8000-0000000000d4','2026-09-21','Strengthening Phase','Dr. Faraj Lashika',now(),
  'Reduce tendon pain, improve load capacity','Isometric wall sits, Spanish squats, heavy slow resistance','3× per week','DEMO','Active',true);

insert into public.rehabilitation_sessions (program_id, session_date, phase, exercises, training_load, pain_score, range_of_motion, strength_progress, functional_progress, physiotherapy_notes, physician_review) values
 ('00000000-0000-4000-8000-0000000000b1','2026-10-08','Early Rehabilitation','ROM, isometrics','Low',4,'DF 8°','4/5','Walking','DEMO session',null),
 ('00000000-0000-4000-8000-0000000000b1','2026-10-16','Strengthening Phase','Calf raises 3×15, band eversion','Moderate',2,'DF 12°','4+/5','Jogging straight line','DEMO session','Approved progression'),
 ('00000000-0000-4000-8000-0000000000b1','2026-10-27','Sport-Specific Rehabilitation','Hop tests, defensive slides','Moderate–High',1,'Full','5/5','Cutting at 80%','DEMO session',null),
 ('00000000-0000-4000-8000-0000000000b2','2026-09-23','Acute Phase','Isometrics 5×45 s','Low',3,'Full','5/5','Modified training','DEMO session',null),
 ('00000000-0000-4000-8000-0000000000b2','2026-10-10','Strengthening Phase','HSR squats','Moderate',2,'Full','5/5','Modified training','DEMO session','Continue');

insert into public.rtp_assessments (injury_id, player_id, assessment_date, current_clinical_status, pain_score, pain_assessment, range_of_motion, muscle_strength,
  functional_testing, balance_assessment, agility, jumping_ability, landing_mechanics, sport_specific_tests, basketball_movement, training_tolerance,
  final_assessment, decision, decision_date, physician_name, clinical_notes, signature, is_demo) values
 ('00000000-0000-4000-8000-0000000000f3','00000000-0000-4000-8000-0000000000d3','2026-09-29','Asymptomatic',0,'Pain-free','Symmetrical','5/5, Nordic within 10%','Sprint 100%','Normal','T-test within baseline','CMJ at baseline','Good','Full-court drills pain-free','Normal','Completed 2 full sessions','DEMO – Fit','Cleared for Competition','2026-09-29','Dr. Faraj Lashika','DEMO','Dr. Faraj Lashika',true),
 ('00000000-0000-4000-8000-0000000000f5','00000000-0000-4000-8000-0000000000d1','2026-10-28','Asymptomatic',0,'Pain-free','Full','5/5','Normal','Normal','Normal','Normal','Good','Normal','Normal','Full session tolerated','DEMO – Fit','Cleared for Competition','2026-10-28','Dr. Faraj Lashika','DEMO','Dr. Faraj Lashika',true),
 ('00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000d2','2026-10-28','Improving',1,'Minimal pain on cutting','Full','5/5','Hop LSI 85%','Y-balance asymmetry 6 cm','80% speed','Reduced single-leg hop','Mild valgus on right landing','Defensive slides pain-free at 80%','Hesitant on hard cuts','Partial','DEMO – Not yet ready','Rehabilitation Required','2026-10-28','Dr. Faraj Lashika','Re-assess in 1 week','Dr. Faraj Lashika',true);

update public.injuries set status = 'Closed', closure_notes = 'DEMO – Recovered, returned to competition'
 where id = '00000000-0000-4000-8000-0000000000f3';

insert into public.player_availability (player_id, injury_id, effective_date, availability, medical_status, restrictions, staff_notes, internal_notes, next_followup_date, is_demo) values
 ('00000000-0000-4000-8000-0000000000d1',null,'2026-10-28','FULLY AVAILABLE','Fit',null,'Cleared after thigh knock',null,null,true),
 ('00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000f1','2026-10-28','INDIVIDUAL TRAINING','Under Rehabilitation','No team contact drills; individual court work only','Re-assessment next week','Hop LSI 85%','2026-11-04',true),
 ('00000000-0000-4000-8000-0000000000d3',null,'2026-09-29','FULLY AVAILABLE','Fit',null,null,null,null,true),
 ('00000000-0000-4000-8000-0000000000d4','00000000-0000-4000-8000-0000000000f2','2026-10-05','MODIFIED TRAINING','Injured','Limit jumping volume; no back-to-back plyometric sessions','Can play limited minutes',null,'2026-11-05',true),
 ('00000000-0000-4000-8000-0000000000d5','00000000-0000-4000-8000-0000000000f4','2026-10-25','MODIFIED TRAINING','Injured','Buddy strapping; avoid contact rebounding drills','Shooting work allowed','Splint weaned','2026-11-04',true);

insert into public.team_exposures (season_id, session_date, session_type, duration_minutes, players_exposed, notes)
select '00000000-0000-4000-8000-00000000a001', d::date, case when extract(dow from d) = 6 then 'Match' else 'Training' end,
       case when extract(dow from d) = 6 then 48 else 90 end, case when extract(dow from d) = 6 then 10 else 14 end, 'DEMO exposure'
  from generate_series('2026-09-01'::date, '2026-10-31'::date, interval '1 day') d
 where extract(dow from d) in (1,2,3,4,6);

commit;
