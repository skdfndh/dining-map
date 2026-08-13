## ADDED Requirements

### Requirement: Organizer access gate
The system SHALL protect the editor entry with a configurable password-derived digest, SHALL remember successful access in the same browser for seven days, and SHALL provide an explicit logout action. The system SHALL describe this mechanism as protection against accidental access rather than secure authentication.

#### Scenario: Successful editor access
- **WHEN** the organizer enters a password matching the configured digest
- **THEN** the system opens the editor and records a seven-day local access session

#### Scenario: Expired editor access
- **WHEN** the organizer opens the editor after the local access session expires
- **THEN** the system requires the password again before exposing editing controls

### Requirement: Activity and participant authoring
The editor SHALL allow the organizer to define an activity name, optional date, optional city, optional introduction, and a participant list with stable internal IDs. The activity name SHALL be required for final publication, and duplicate display names SHALL be distinguishable through optional notes.

#### Scenario: Duplicate participant names
- **WHEN** the organizer adds two participants with the same visible name and different notes
- **THEN** the editor stores distinct IDs and presents the notes wherever disambiguation is required

### Requirement: Station detail authoring
The editor SHALL allow each station visit to be created independently with a stable ID, short label, full name, address, coordinates, optional POI ID, activity description, participant selection, and optional organizer reminder. Two visits at the same coordinates SHALL remain separate stations.

#### Scenario: Repeated visit to one place
- **WHEN** the organizer adds the same place twice to the itinerary
- **THEN** the editor creates two independently editable and orderable station visits

### Requirement: Flexible time model
The editor SHALL support an exact start time, one of the fixed periods `清晨`, `上午`, `中午`, `下午`, `傍晚`, `晚上`, `深夜`, or a pending time for each station. Exact times SHALL support a relative day offset for cross-midnight activities, and the end time SHALL be optional.

#### Scenario: Pending station time
- **WHEN** a station has neither an exact time nor a fuzzy period
- **THEN** the editor stores it as pending and labels it `待定` instead of interpreting it as midnight

#### Scenario: Cross-midnight station
- **WHEN** a station begins at 01:00 on the day after the activity date
- **THEN** the editor preserves the next-day offset and orders it after first-day evening stations

### Requirement: Semi-automatic itinerary ordering
The editor SHALL initially order exact times chronologically, order fuzzy periods by their defined period sequence, and place pending stations in an unscheduled area. The organizer SHALL be able to drag any station into the itinerary, and later time edits SHALL NOT override the manual order unless the organizer explicitly requests time-based sorting.

#### Scenario: Insert an unscheduled station
- **WHEN** the organizer drags a pending station between the second and third scheduled stations
- **THEN** the editor preserves that location in the itinerary regardless of its pending time

#### Scenario: Explicit re-sort
- **WHEN** the organizer selects the time-based re-sort action
- **THEN** the editor rebuilds the order from exact and fuzzy times and returns pending stations to the unscheduled area

### Requirement: Schedule feasibility warnings
The editor SHALL compare adjacent station times with the route duration and SHALL warn when the itinerary implies insufficient travel time. Such warnings SHALL NOT prevent draft export or publication.

#### Scenario: Expected late arrival
- **WHEN** the previous station ends at 14:00, travel requires 30 minutes, and the next station starts at 14:10
- **THEN** the editor reports an expected 20-minute conflict and still permits export

### Requirement: Durable draft workflow
The editor SHALL automatically save changes locally, display save status, restore the latest draft on a later visit, allow the draft to be cleared, and allow a previously exported event file to be imported for continued editing.

#### Scenario: Resume after closing browser
- **WHEN** the organizer returns after closing the editor with a successfully saved draft
- **THEN** the editor offers or restores the same activity content without requiring the public event file

### Requirement: Publication preview and validation
The editor SHALL provide a mobile viewer preview and SHALL run validation before export. Validation SHALL distinguish blocking errors from non-blocking warnings and SHALL permit incomplete settlement data to be exported as a draft or organizing-in-progress event.

#### Scenario: Export with pending time warning
- **WHEN** the activity has a name and valid structure but includes a pending station time
- **THEN** the editor shows a warning and allows JSON export

#### Scenario: Block invalid final settlement
- **WHEN** the organizer attempts to mark settlement complete while an expense is unbalanced
- **THEN** the editor identifies the blocking error and refuses the completed status

