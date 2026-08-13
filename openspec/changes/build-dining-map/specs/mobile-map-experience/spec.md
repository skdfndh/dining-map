## ADDED Requirements

### Requirement: Map-first mobile presentation
The viewer SHALL use the map as the primary mobile surface and SHALL display each station's sequence number, short name, and exact time, fuzzy period, or `待定` directly on its marker without requiring a permanent itinerary list.

#### Scenario: Pending-time marker
- **WHEN** a station has a pending time
- **THEN** its map marker displays its number, short name, and `待定`

### Requirement: Station and route details
The viewer SHALL open an on-demand bottom detail card for a selected station and SHALL show full name, address, time, arrangement, participants, reminder, expense state, and navigation actions. Selecting a route segment SHALL show transport mode, distance, and duration when available.

#### Scenario: Open station card
- **WHEN** the participant taps a station marker
- **THEN** the map keeps the station in view and opens its complete detail card from the bottom

### Requirement: Full-route and step-through modes
The viewer SHALL provide a full-route mode and a step-through mode with previous station, next station, and return-to-full-route actions. After returning to the full route, the participant SHALL be able to resume step-through mode at the retained station.

#### Scenario: Resume step-through browsing
- **WHEN** the participant views the full route and then returns to step-through mode
- **THEN** the viewer focuses the station that was active before the mode switch

### Requirement: Personal arrival progress
The viewer SHALL allow the participant to mark the focused station as arrived, undo that action, or directly choose a different current station. This progress SHALL be stored only in that browser and namespaced by activity and stable station IDs.

#### Scenario: Restore arrival progress
- **WHEN** the participant reopens an updated activity whose activity and station IDs are unchanged
- **THEN** the viewer restores the participant's previously selected current station

#### Scenario: Undo arrival
- **WHEN** the participant selects undo after marking a station arrived
- **THEN** the viewer removes that arrival state and recalculates the current and next station display

### Requirement: Current-station inference
The viewer SHALL prioritize manual arrival progress, then infer from exact times on the activity date, then select the first unarrived station, and otherwise show the full route. Fuzzy periods SHALL NOT be used for minute-level inference, and activities not occurring today SHALL default to the full route.

#### Scenario: Infer active exact-time station
- **WHEN** the activity is today, no manual progress exists, and the current time falls within a station's exact start and end times
- **THEN** the viewer focuses that station as the inferred current station

### Requirement: Visually distinguish progress accessibly
Past stations and route portions SHALL appear dimmer and mixed with gray while remaining readable and interactive. Current and next stations SHALL use stronger warm accents, and state SHALL also be conveyed through labels or icons rather than color alone.

#### Scenario: Past station remains usable
- **WHEN** a station is earlier than the participant's current station
- **THEN** its marker is visually subdued but can still be tapped to open details

### Requirement: Respect manual map exploration
The viewer SHALL NOT force the viewport back to the current station after the participant manually pans or zooms the map. Explicit focus, previous/next, current-station, or full-route actions MAY recenter it.

#### Scenario: Pan away from current station
- **WHEN** the participant drags the map after a station was focused
- **THEN** the viewer leaves the manually selected viewport unchanged until another explicit focus action

### Requirement: Dual-map navigation
Each station detail SHALL provide AMap and Baidu Maps navigation actions targeting the selected station from the participant's current location when supported. If app launch or positioning is restricted, the viewer SHALL offer a web-map attempt, address copy, and guidance to open the page in the system browser.

#### Scenario: Navigation restricted in WeChat
- **WHEN** a navigation action cannot be completed in the embedded browser
- **THEN** the viewer keeps all station details accessible and shows system-browser and address-copy alternatives

### Requirement: Personal expense focus
The viewer SHALL allow a participant to choose `我是谁`, remember that stable participant ID locally, and use it to highlight personal expense and transfer information while keeping the complete settlement visible.

#### Scenario: Reopen as selected participant
- **WHEN** the participant returns to the same activity after choosing their identity
- **THEN** the viewer automatically highlights that participant's settlement unless the selection is changed

