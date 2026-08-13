## ADDED Requirements

### Requirement: Multiple place acquisition methods
The editor SHALL allow a station to be selected through AMap keyword/address search, a long press on the map, or a pasted AMap/Baidu Maps sharing link.

#### Scenario: Select search result
- **WHEN** the organizer chooses a place returned by AMap search
- **THEN** the editor fills the available name, address, coordinate, and POI fields and allows confirmation as a station

#### Scenario: Long-press selection
- **WHEN** the organizer long-presses a map coordinate
- **THEN** the editor reverse-geocodes that coordinate, creates a candidate station with the closest available POI or formatted road address, and allows any remaining descriptive fields to be completed manually

#### Scenario: Select a hovered map label
- **WHEN** the organizer points at an interactive AMap place label and right-clicks without moving away
- **THEN** the editor selects that exact hotspot name, POI ID, and coordinate instead of choosing the nearest reverse-geocoding result

#### Scenario: Reverse-geocoding unavailable
- **WHEN** reverse geocoding fails after the organizer selects a map coordinate
- **THEN** the editor retains the coordinate as a manually editable station and clearly reports that its name and address need confirmation

### Requirement: Sharing-link fallback
The system SHALL attempt to extract useful destination information from supported AMap and Baidu Maps sharing links. A parsing or cross-origin failure SHALL lead to an explicit search-or-manual-selection fallback and SHALL NOT discard the pasted link before the organizer can inspect it.

#### Scenario: Unresolvable short link
- **WHEN** a pasted short sharing link cannot be resolved in the browser
- **THEN** the editor explains the limitation and offers place search and map selection as alternatives

### Requirement: Supported transport modes
The editor SHALL support walking, cycling, driving, taxi, public transport, and custom transport for each adjacent station pair. Taxi SHALL use driving route calculation while retaining taxi display semantics.

#### Scenario: Taxi route
- **WHEN** the organizer selects taxi between two stations
- **THEN** the system requests a driving route and stores the segment transport type as taxi

### Requirement: Route calculation and freezing
For non-custom transport, the editor SHALL automatically request a real road route from AMap whenever a new adjacent segment is created or its transport mode changes, using walking as the default mode. The editor SHALL store the resulting distance, duration, road geometry, calculation timestamp, and source status in the event data. It SHALL NOT classify a result without valid road geometry as ready. The viewer SHALL be able to render the segment without recalculating it.

#### Scenario: Successful walking calculation
- **WHEN** AMap returns a walking route between adjacent stations
- **THEN** the editor freezes its geometry, distance, and duration into the exported activity

#### Scenario: New adjacency defaults to walking roads
- **WHEN** the organizer adds or reorders stations so that a new adjacent segment is created
- **THEN** the editor automatically calculates and displays a reachable walking route without requiring a route-card click

#### Scenario: Cycling geometry is returned
- **WHEN** the organizer changes a segment to cycling and AMap returns riding steps
- **THEN** the editor parses and freezes the riding road geometry instead of replacing it with a straight endpoint line

### Requirement: Incremental route invalidation
The editor SHALL retain route segments whose ordered endpoint IDs and transport settings remain unchanged, and SHALL invalidate and recalculate only segments affected by station insertion, removal, movement, coordinate change, or transport change.

#### Scenario: Move fourth station to second
- **WHEN** the organizer moves the fourth station into the second position
- **THEN** the editor reuses unaffected route segments and recalculates only segments whose adjacency changed

### Requirement: Custom and failed-route fallback
Custom transport SHALL allow manual description and duration and SHALL render as a dashed endpoint connection. If automatic routing fails, the editor SHALL offer the same dashed fallback and SHALL allow publication with a warning.

#### Scenario: Public transport calculation fails
- **WHEN** AMap cannot return a public transport route
- **THEN** the editor retains the two stations, warns the organizer, and permits a custom description and duration

### Requirement: Route recalc control
The editor SHALL expose a manual action to recalculate stale or selected automatic route segments before publication.

#### Scenario: Refresh frozen route
- **WHEN** the organizer requests recalculation for an existing automatic segment
- **THEN** the editor replaces the prior frozen route only after a valid new result is received
