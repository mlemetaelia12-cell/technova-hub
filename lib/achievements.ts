import { sql } from './db';
let schemaReady: Promise<void> | null = null;
async function ensureSchema(){if(!schemaReady)schemaReady=(async()=>{await sql`CREATE TABLE IF NOT EXISTS achievements (id BIGSERIAL PRIMARY KEY, achievement_key VARCHAR(60) NOT NULL UNIQUE, title VARCHAR(120) NOT NULL, description TEXT NOT NULL)`;await sql`CREATE TABLE IF NOT EXISTS participant_achievements (participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE, achievement_id BIGINT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE, earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(participant_id, achievement_id))`;})();await schemaReady;}
export async function syncAchievements(participantId:number){
 await ensureSchema();
 await sql`INSERT INTO achievements(achievement_key,title,description) VALUES
 ('first-answer','First Answer','Answer your first question'),('first-correct','First Correct Answer','Get your first answer right'),('five-correct','Five Correct','Answer five questions correctly'),('ten-correct','Ten Correct','Answer ten questions correctly'),('hundred-questions','100 Questions','Answer one hundred questions'),('streak-seven','Consistency Champion','Build a seven-day streak'),('challenge-complete','Challenge Completed','Answer all five questions in a challenge'),('xp-100','100 XP Club','Earn 100 total experience points'),('first-checkpoint','Knowledge Checked','Pass your first learning checkpoint'),('first-practical','Hands-on Learner','Pass your first practical assessment'),('first-certificate','TECHNOVA Certified','Earn your first learning certificate') ON CONFLICT (achievement_key) DO NOTHING`;
 await sql`INSERT INTO participant_achievements(participant_id,achievement_id)
 SELECT ${participantId},a.id FROM achievements a WHERE
 (a.achievement_key='first-answer' AND EXISTS(SELECT 1 FROM challenge_attempts WHERE participant_id=${participantId})) OR
 (a.achievement_key='first-correct' AND EXISTS(SELECT 1 FROM challenge_attempts WHERE participant_id=${participantId} AND is_correct)) OR
 (a.achievement_key='five-correct' AND (SELECT COUNT(*) FROM challenge_attempts WHERE participant_id=${participantId} AND is_correct)>=5) OR
 (a.achievement_key='ten-correct' AND (SELECT COUNT(*) FROM challenge_attempts WHERE participant_id=${participantId} AND is_correct)>=10) OR
 (a.achievement_key='hundred-questions' AND (SELECT COUNT(*) FROM challenge_attempts WHERE participant_id=${participantId})>=100) OR
 (a.achievement_key='challenge-complete' AND EXISTS(SELECT 1 FROM (SELECT challenge_id FROM challenge_attempts WHERE participant_id=${participantId} GROUP BY challenge_id HAVING COUNT(*)>=5) c)) OR
 (a.achievement_key='streak-seven' AND EXISTS(
   SELECT 1 FROM (
     SELECT day_value,day_value-ROW_NUMBER() OVER(ORDER BY day_value)::int AS streak_group
     FROM (SELECT DISTINCT dc.challenge_date AS day_value FROM challenge_attempts ca JOIN daily_challenges dc ON dc.id=ca.challenge_id WHERE ca.participant_id=${participantId}) active_days
   ) streak_days GROUP BY streak_group HAVING COUNT(*)>=7
 )) OR
 (a.achievement_key='xp-100' AND ((SELECT COALESCE(SUM(points),0) FROM challenge_attempts WHERE participant_id=${participantId})+(SELECT COALESCE(SUM(amount),0) FROM xp_rewards WHERE participant_id=${participantId}))>=100) OR
 (a.achievement_key='first-checkpoint' AND EXISTS(SELECT 1 FROM learning_checkpoint_attempts WHERE participant_id=${participantId} AND passed)) OR
 (a.achievement_key='first-practical' AND EXISTS(SELECT 1 FROM learning_practical_submissions WHERE participant_id=${participantId} AND passed)) OR
 (a.achievement_key='first-certificate' AND EXISTS(SELECT 1 FROM certificates WHERE participant_id=${participantId}))
 ON CONFLICT DO NOTHING`;
 return sql`SELECT a.achievement_key,a.title,a.description,pa.earned_at FROM participant_achievements pa JOIN achievements a ON a.id=pa.achievement_id WHERE pa.participant_id=${participantId} ORDER BY pa.earned_at DESC`;
}

export async function syncAchievementsBestEffort(participantId:number){
 try{return await syncAchievements(participantId);}catch(error){console.error('Achievement synchronization deferred; it will retry on profile load.',error);return [];}
}
