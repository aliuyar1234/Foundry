-- =============================================================================
-- SSO Tables Migration
-- SCALE Tier - Enterprise SSO
--
-- Creates tables for SSO configuration, role mapping, and directory sync
-- =============================================================================

-- SSO Configuration Table
CREATE TABLE IF NOT EXISTS "sso_configuration" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "provider_type" VARCHAR(20) NOT NULL CHECK ("provider_type" IN ('SAML', 'OIDC')),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configuration" JSONB NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fk_sso_config_org" FOREIGN KEY ("organization_id")
        REFERENCES "organization"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_sso_config_org" ON "sso_configuration"("organization_id");
CREATE INDEX "idx_sso_config_provider" ON "sso_configuration"("provider_type");
CREATE UNIQUE INDEX "idx_sso_config_org_provider" ON "sso_configuration"("organization_id", "provider_type");

-- SSO Role Mapping Table
CREATE TABLE IF NOT EXISTS "sso_role_mapping" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "source_type" VARCHAR(20) NOT NULL CHECK ("source_type" IN ('group', 'role', 'attribute')),
    "source_value" VARCHAR(500) NOT NULL,
    "source_pattern" VARCHAR(500),
    "target_role" VARCHAR(100) NOT NULL,
    "target_permissions" JSONB DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 10,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fk_role_mapping_org" FOREIGN KEY ("organization_id")
        REFERENCES "organization"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_role_mapping_org" ON "sso_role_mapping"("organization_id");
CREATE INDEX "idx_role_mapping_priority" ON "sso_role_mapping"("priority");
CREATE INDEX "idx_role_mapping_enabled" ON "sso_role_mapping"("enabled");

-- Directory Sync Configuration Table
CREATE TABLE IF NOT EXISTS "directory_sync_config" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "source_type" VARCHAR(20) NOT NULL CHECK ("source_type" IN ('scim', 'ldap', 'azure-ad', 'okta', 'google')),
    "source_config" JSONB NOT NULL,
    "sync_users" BOOLEAN NOT NULL DEFAULT true,
    "sync_groups" BOOLEAN NOT NULL DEFAULT true,
    "sync_roles" BOOLEAN NOT NULL DEFAULT true,
    "schedule_enabled" BOOLEAN NOT NULL DEFAULT false,
    "schedule_interval" INTEGER NOT NULL DEFAULT 60,
    "schedule_cron" VARCHAR(100),
    "user_filter" VARCHAR(500),
    "group_filter" VARCHAR(500),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP WITH TIME ZONE,
    "last_sync_status" VARCHAR(20) CHECK ("last_sync_status" IN ('success', 'partial', 'failed')),
    "last_sync_error" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fk_dir_sync_config_org" FOREIGN KEY ("organization_id")
        REFERENCES "organization"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_dir_sync_config_org" ON "directory_sync_config"("organization_id");
CREATE INDEX "idx_dir_sync_config_enabled" ON "directory_sync_config"("enabled");
CREATE INDEX "idx_dir_sync_config_schedule" ON "directory_sync_config"("schedule_enabled");

-- Directory Sync Job Table
CREATE TABLE IF NOT EXISTS "directory_sync_job" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "config_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'running', 'completed', 'failed')),
    "type" VARCHAR(20) NOT NULL DEFAULT 'incremental' CHECK ("type" IN ('full', 'incremental')),
    "started_at" TIMESTAMP WITH TIME ZONE,
    "completed_at" TIMESTAMP WITH TIME ZONE,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fk_dir_sync_job_config" FOREIGN KEY ("config_id")
        REFERENCES "directory_sync_config"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_dir_sync_job_org" FOREIGN KEY ("organization_id")
        REFERENCES "organization"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_dir_sync_job_config" ON "directory_sync_job"("config_id");
CREATE INDEX "idx_dir_sync_job_status" ON "directory_sync_job"("status");
CREATE INDEX "idx_dir_sync_job_created" ON "directory_sync_job"("created_at" DESC);

-- SCIM Sync Log Table
CREATE TABLE IF NOT EXISTS "scim_sync_log" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "operation" VARCHAR(20) NOT NULL,
    "resource_type" VARCHAR(20) NOT NULL,
    "resource_id" VARCHAR(255),
    "external_id" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL,
    "error" TEXT,
    "request_body" JSONB,
    "response_body" JSONB,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fk_scim_log_org" FOREIGN KEY ("organization_id")
        REFERENCES "organization"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_scim_log_org" ON "scim_sync_log"("organization_id");
CREATE INDEX "idx_scim_log_created" ON "scim_sync_log"("created_at" DESC);
CREATE INDEX "idx_scim_log_resource" ON "scim_sync_log"("resource_type", "resource_id");

-- Group Table (for SCIM groups)
CREATE TABLE IF NOT EXISTS "group" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "sso_external_id" VARCHAR(255),
    "sso_provider" VARCHAR(50),
    "sso_attributes" JSONB,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fk_group_org" FOREIGN KEY ("organization_id")
        REFERENCES "organization"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_group_org" ON "group"("organization_id");
CREATE INDEX "idx_group_sso_external" ON "group"("sso_external_id");
CREATE UNIQUE INDEX "idx_group_org_name" ON "group"("organization_id", "name");

-- Group Membership Table
CREATE TABLE IF NOT EXISTS "group_membership" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fk_membership_user" FOREIGN KEY ("user_id")
        REFERENCES "user"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_membership_group" FOREIGN KEY ("group_id")
        REFERENCES "group"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "idx_membership_user_group" ON "group_membership"("user_id", "group_id");
CREATE INDEX "idx_membership_user" ON "group_membership"("user_id");
CREATE INDEX "idx_membership_group" ON "group_membership"("group_id");

-- Add SSO columns to User table
ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "sso_external_id" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "sso_provider" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "sso_groups" JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "sso_roles" JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "sso_attributes" JSONB,
ADD COLUMN IF NOT EXISTS "sso_mappings_applied" JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "roles" JSONB DEFAULT '["USER"]',
ADD COLUMN IF NOT EXISTS "permissions" JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS "idx_user_sso_external" ON "user"("sso_external_id");
CREATE INDEX IF NOT EXISTS "idx_user_sso_provider" ON "user"("sso_provider");

-- Audit Log for SSO events
CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(255) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "details" JSONB,
    "performed_by" VARCHAR(255) NOT NULL,
    "performed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT
);

CREATE INDEX "idx_audit_log_entity" ON "audit_log"("entity_type", "entity_id");
CREATE INDEX "idx_audit_log_action" ON "audit_log"("action");
CREATE INDEX "idx_audit_log_performed" ON "audit_log"("performed_at" DESC);
CREATE INDEX "idx_audit_log_user" ON "audit_log"("performed_by");

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_sso_config_updated_at
    BEFORE UPDATE ON "sso_configuration"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_role_mapping_updated_at
    BEFORE UPDATE ON "sso_role_mapping"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dir_sync_config_updated_at
    BEFORE UPDATE ON "directory_sync_config"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_updated_at
    BEFORE UPDATE ON "group"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
