-- Migration 1: Enable required PostgreSQL extensions.
-- uuid-ossp provides uuid_generate_v4() as a fallback.
-- pgcrypto provides gen_random_uuid() which is preferred for new primary keys.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
