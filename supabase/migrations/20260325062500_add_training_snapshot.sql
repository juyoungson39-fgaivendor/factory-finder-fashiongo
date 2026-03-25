-- Add training_snapshot column to ai_training_jobs
-- Stores IDs of all data sources used in each training run
ALTER TABLE ai_training_jobs
ADD COLUMN IF NOT EXISTS training_snapshot jsonb DEFAULT NULL;

COMMENT ON COLUMN ai_training_jobs.training_snapshot IS 'Snapshot of training data IDs: { correction_ids, confirmed_factory_ids, deleted_factory_ids }';
