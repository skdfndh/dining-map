## ADDED Requirements

### Requirement: Versioned public event contract
The system SHALL read and export a documented `event.json` contract containing a schema version, stable activity/entity IDs, activity metadata, participants, ordered stations, frozen route segments, expenses, and settlement state.

#### Scenario: Export valid activity data
- **WHEN** the organizer exports an activity that passes structural validation
- **THEN** the downloaded JSON contains the current schema version and all data required for the viewer to operate without editor state

### Requirement: Stable identity across edits
Importing and re-exporting an activity SHALL preserve valid activity, participant, station, route, and expense IDs. Only newly created entities SHALL receive new IDs.

#### Scenario: Add post-event expense
- **WHEN** the organizer imports a published event and adds a new expense
- **THEN** existing IDs remain unchanged and only the new expense receives a new ID

### Requirement: Version validation and migration boundary
The loader SHALL enforce a bounded file size and SHALL validate the file structure, finite numeric ranges, clock values, and schema version before mutating the editor. It SHALL migrate supported older versions or reject unsupported newer versions with a clear message while leaving the current draft intact. Public strings SHALL be rendered as text rather than injected HTML.

#### Scenario: Import unsupported future version
- **WHEN** the organizer selects an event file whose schema version is newer than the application supports
- **THEN** the editor refuses the import, explains the version mismatch, and retains the existing draft

#### Scenario: Reject unsafe public data
- **WHEN** an activity file exceeds the size limit, contains out-of-range values, or includes markup in a visible name
- **THEN** the loader rejects invalid structure and the viewer displays accepted names literally without creating executable markup

### Requirement: JSON draft and publication export
The editor SHALL allow structurally valid incomplete activities to be exported with their current settlement state and validation warnings. It SHALL NOT label an event as completed when completed-settlement invariants fail.

#### Scenario: Export organizing-in-progress data
- **WHEN** the organizer exports an activity containing pending expenses in the organizing-in-progress state
- **THEN** the JSON retains pending amounts as null values and the viewer treats the settlement as non-final

### Requirement: CSV settlement export
The editor SHALL export a UTF-8 spreadsheet-compatible CSV containing confirmed expense details, participant consumption, advances, net balances, and transfers, and SHALL mark whether the data is final.

#### Scenario: Export Chinese names to CSV
- **WHEN** the organizer exports a settlement containing Chinese participant and station names
- **THEN** the downloaded CSV opens with readable names in common spreadsheet software and includes the settlement status

### Requirement: Browser-local viewer state isolation
The viewer SHALL store identity, current station, arrival progress, and browsing mode locally under the activity ID. These values SHALL NOT be included in public JSON or CSV exports.

#### Scenario: Two activities in one browser
- **WHEN** a participant opens two activities with different activity IDs
- **THEN** each activity restores its own identity and progress without overwriting the other

#### Scenario: Ignore damaged local state
- **WHEN** saved viewer state is malformed or refers to participants and stations removed from the current activity
- **THEN** the viewer discards invalid fields, preserves valid fields, and remains usable without changing the public activity

### Requirement: Reusable domain interfaces
The implementation SHALL expose framework-independent TypeScript modules for event parsing, validation, time ordering, route-segment identity, settlement calculation, JSON export, and CSV export so future templates can reuse the behavior without importing UI components.

#### Scenario: Calculate settlement outside editor UI
- **WHEN** a caller supplies valid event-domain objects directly to the settlement module
- **THEN** the module returns deterministic totals and transfers without requiring a DOM or map instance

### Requirement: Encrypted static publication
The system SHALL publish real activity data as a versioned AES-256-GCM encrypted envelope derived from a viewing password with PBKDF2-SHA-256. The public envelope SHALL contain no plaintext activity metadata, SHALL use a fresh random salt and initialization vector for every export, and SHALL enforce bounded file size and cryptographic parameters before key derivation. Plain `event.json` SHALL remain an organizer-only backup/import format and SHALL NOT be required by the public viewer.

#### Scenario: Publish to a public repository
- **WHEN** the organizer encrypts a structurally valid activity with a sufficiently long viewing password
- **THEN** the downloaded `event.enc.json` contains only encryption parameters and ciphertext, and does not contain the activity title, participant names, addresses, or amounts in plaintext

#### Scenario: Re-export the same activity
- **WHEN** the organizer encrypts identical activity JSON twice with the same password
- **THEN** the two envelopes use different random salt and initialization vector values and produce different ciphertext

### Requirement: Browser-local viewer unlock
The public viewer SHALL fetch only the encrypted activity file, SHALL display no activity metadata before successful decryption, and SHALL decrypt and validate the activity in the browser without transmitting or persisting the viewing password. A refresh SHALL require the password again. Wrong passwords and authenticated-ciphertext failures SHALL return one generic error.

#### Scenario: Unlock a valid invitation
- **WHEN** a participant supplies the correct password for the published envelope
- **THEN** the viewer decrypts and validates the activity locally and opens the normal map experience

#### Scenario: Enter a wrong password
- **WHEN** a participant supplies a password that cannot authenticate the ciphertext
- **THEN** the viewer keeps all activity fields hidden and reports that the password is incorrect or the activity file is damaged
