-- Coordinator scope is authorization data. It must be selected explicitly;
-- PostgreSQL must never invent CWTS for an omitted value.
--
-- Historical profiles can be resolved from either their component relation or
-- the coordinatorScope value stored by the dedicated coordinator provisioning
-- flow. Refuse the migration when those sources disagree or neither is usable.
--
-- Guard order matters. Guard 0 runs first because a broken relationship makes
-- every later predicate unreliable: a dangling componentId is invisible to a
-- component-derived mapping (the join finds nothing) and is simultaneously
-- excluded from the metadata-derived mapping (componentId IS NOT NULL), so such
-- a row would silently keep the historical DEFAULT 'CWTS'. Aborting is the only
-- acceptable outcome -- this migration must never guess, repair silently, or
-- preserve a stale CWTS grant.

-- Guard 0: referential integrity of coordinator_profile.
-- Covers orphan userId and dangling componentId. Both conditions mean the
-- database cannot answer "which program does this coordinator administer?", so
-- there is nothing safe to derive.
DO $$
DECLARE
  broken integer;
BEGIN
  SELECT COUNT(*)
  INTO broken
  FROM "coordinator_profile" coordinator
  LEFT JOIN "user" account
    ON account."id" = coordinator."userId"
  LEFT JOIN "nstp_component" component
    ON component."id" = coordinator."componentId"
  WHERE account."id" IS NULL
     OR (
       coordinator."componentId" IS NOT NULL
       AND component."id" IS NULL
     );

  IF broken > 0 THEN
    RAISE EXCEPTION
      'Coordinator scope migration stopped: % coordinator_profile row(s) contain dangling userId/componentId relationships. Run npm run report:orphans and npm run preflight:production, then resolve the reported profile IDs. Do not delete or remap these rows automatically.',
      broken;
  END IF;
END $$;

-- Guard 1: every referenced component type must have an explicit scope mapping.
-- NSTPComponentType is a closed five-value enum today. If a sixth value is ever
-- added, this guard fails the deployment instead of letting an open-ended
-- ELSE branch quietly grant CWTS.
DO $$
DECLARE
  unmapped integer;
BEGIN
  SELECT COUNT(*)
  INTO unmapped
  FROM "coordinator_profile" coordinator
  JOIN "nstp_component" component
    ON component."id" = coordinator."componentId"
  WHERE component."type"::text NOT IN (
    'CWTS', 'CWTS_COAST_GUARD', 'LTS', 'MTS_ARMY', 'MTS_NAVY'
  );

  IF unmapped > 0 THEN
    RAISE EXCEPTION
      'Coordinator scope migration stopped: % coordinator_profile row(s) reference an NSTP component type with no explicit CoordinatorScope mapping. Extend this migration''s mapping deliberately before deploying.',
      unmapped;
  END IF;
END $$;

-- Guard 2: component relation and account metadata must not disagree.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "coordinator_profile" coordinator
    JOIN "user" account ON account."id" = coordinator."userId"
    LEFT JOIN "nstp_component" component ON component."id" = coordinator."componentId"
    WHERE component."type" IS NOT NULL
      AND account."data"->>'coordinatorScope' IN ('CWTS', 'LTS', 'MTS')
      AND account."data"->>'coordinatorScope' <> CASE component."type"
        WHEN 'MTS_ARMY' THEN 'MTS'
        WHEN 'MTS_NAVY' THEN 'MTS'
        WHEN 'LTS' THEN 'LTS'
        WHEN 'CWTS' THEN 'CWTS'
        WHEN 'CWTS_COAST_GUARD' THEN 'CWTS'
      END
  ) THEN
    RAISE EXCEPTION 'Coordinator scope migration stopped: component and account metadata disagree. Run npm run preflight:production and resolve the reported profile IDs.';
  END IF;

  -- Guard 3: profiles with no component relation need usable account metadata.
  -- Guard 0 has already rejected dangling componentId values, so
  -- component."type" IS NULL here is now equivalent to componentId IS NULL --
  -- the same set the metadata-derived UPDATE below operates on.
  IF EXISTS (
    SELECT 1
    FROM "coordinator_profile" coordinator
    JOIN "user" account ON account."id" = coordinator."userId"
    LEFT JOIN "nstp_component" component ON component."id" = coordinator."componentId"
    WHERE component."type" IS NULL
      AND COALESCE(account."data"->>'coordinatorScope', '') NOT IN ('CWTS', 'LTS', 'MTS')
  ) THEN
    RAISE EXCEPTION 'Coordinator scope migration stopped: one or more profiles have no authoritative program mapping. Run npm run preflight:production and map them before deployment.';
  END IF;
END $$;

-- Component-derived scope. Authoritative when a component relation exists.
-- The mapping is exhaustive over NSTPComponentType and deliberately has no ELSE
-- branch: an unmapped type yields NULL, which the NOT NULL constraint on
-- "scope" rejects, so the migration aborts rather than inventing a grant.
UPDATE "coordinator_profile" coordinator
SET "scope" = CASE component."type"
  WHEN 'MTS_ARMY' THEN 'MTS'::"CoordinatorScope"
  WHEN 'MTS_NAVY' THEN 'MTS'::"CoordinatorScope"
  WHEN 'LTS' THEN 'LTS'::"CoordinatorScope"
  WHEN 'CWTS' THEN 'CWTS'::"CoordinatorScope"
  WHEN 'CWTS_COAST_GUARD' THEN 'CWTS'::"CoordinatorScope"
END
FROM "nstp_component" component
WHERE component."id" = coordinator."componentId";

-- Metadata-derived scope, only for profiles with no component relation.
-- Guard 3 has already proven the value is one of CWTS/LTS/MTS, so the cast
-- cannot fail here.
UPDATE "coordinator_profile" coordinator
SET "scope" = (account."data"->>'coordinatorScope')::"CoordinatorScope"
FROM "user" account
WHERE account."id" = coordinator."userId"
  AND coordinator."componentId" IS NULL;

-- Post-condition: every component-backed profile now agrees with its component.
-- This catches a mapping regression introduced by a future edit to this file.
DO $$
DECLARE
  mismatched integer;
BEGIN
  SELECT COUNT(*)
  INTO mismatched
  FROM "coordinator_profile" coordinator
  JOIN "nstp_component" component
    ON component."id" = coordinator."componentId"
  WHERE coordinator."scope" <> CASE component."type"
    WHEN 'MTS_ARMY' THEN 'MTS'::"CoordinatorScope"
    WHEN 'MTS_NAVY' THEN 'MTS'::"CoordinatorScope"
    WHEN 'LTS' THEN 'LTS'::"CoordinatorScope"
    WHEN 'CWTS' THEN 'CWTS'::"CoordinatorScope"
    WHEN 'CWTS_COAST_GUARD' THEN 'CWTS'::"CoordinatorScope"
  END;

  IF mismatched > 0 THEN
    RAISE EXCEPTION
      'Coordinator scope migration stopped: % coordinator_profile row(s) disagree with their component after backfill.',
      mismatched;
  END IF;
END $$;

-- Remove the historical DEFAULT 'CWTS'. The application always supplies scope
-- explicitly (see createCoordinator in src/modules/staff/staff.service.js).
ALTER TABLE "coordinator_profile"
ALTER COLUMN "scope" DROP DEFAULT;
