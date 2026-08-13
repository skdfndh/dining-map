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
The loader SHALL validate the file structure and schema version before mutating the editor. It SHALL migrate supported older versions or reject unsupported newer versions with a clear message while leaving the current draft intact.

#### Scenario: Import unsupported future version
- **WHEN** the organizer selects an event file whose schema version is newer than the application supports
- **THEN** the editor refuses the import, explains the version mismatch, and retains the existing draft

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

### Requirement: Reusable domain interfaces
The implementation SHALL expose framework-independent TypeScript modules for event parsing, validation, time ordering, route-segment identity, settlement calculation, JSON export, and CSV export so future templates can reuse the behavior without importing UI components.

#### Scenario: Calculate settlement outside editor UI
- **WHEN** a caller supplies valid event-domain objects directly to the settlement module
- **THEN** the module returns deterministic totals and transfers without requiring a DOM or map instance

