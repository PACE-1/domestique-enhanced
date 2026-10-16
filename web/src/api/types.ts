// Response types for the typed-contract routes, generated from the backend
// (tools/gen-api-types.sh). Import from here, not from schema.d.ts.
import type { components } from "@/api/schema"

type S = components["schemas"]

export type Profile = S["ProfileEntry"]
export type ProfilesList = S["ProfilesList"]
export type IcuConnection = S["IcuConnection"]
export type SyncProgress = S["SyncProgress"]
export type DfaRides = S["DfaRides"]
export type DfaRide = S["DfaRide"]
export type DfaThreshold = S["DfaThreshold"]
export type BackfillStatus = S["BackfillStatus"]
export type SetupDefaults = S["SetupDefaults"]
