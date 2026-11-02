-- Removes ONLY records flagged as DEMO. Real records are untouched.
begin;
delete from public.player_availability where is_demo or player_id in (select id from public.players where is_demo);
delete from public.medical_clearances where player_id in (select id from public.players where is_demo);
delete from public.rtp_assessments where player_id in (select id from public.players where is_demo);
delete from public.rehabilitation_sessions where program_id in (select id from public.rehabilitation_programs where player_id in (select id from public.players where is_demo));
delete from public.rehabilitation_programs where player_id in (select id from public.players where is_demo);
delete from public.treatments where injury_id in (select id from public.injuries where player_id in (select id from public.players where is_demo));
delete from public.injury_followups where injury_id in (select id from public.injuries where player_id in (select id from public.players where is_demo));
delete from public.medical_documents where player_id in (select id from public.players where is_demo);
delete from public.injuries where player_id in (select id from public.players where is_demo);
delete from public.examination_findings where examination_id in (select id from public.medical_examinations where player_id in (select id from public.players where is_demo));
delete from public.medical_examinations where player_id in (select id from public.players where is_demo);
delete from public.medical_histories where player_id in (select id from public.players where is_demo);
delete from public.player_emergency_contacts where player_id in (select id from public.players where is_demo);
delete from public.players where is_demo;
delete from public.team_exposures where notes = 'DEMO exposure';
commit;
