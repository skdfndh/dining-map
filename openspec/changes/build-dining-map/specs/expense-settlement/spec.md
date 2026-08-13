## ADDED Requirements

### Requirement: Station and global expense items
The editor SHALL allow an expense to belong to a specific station or to the activity as a whole. An expense MAY be created with no amount and MAY be added after the activity.

The editor SHALL visibly indicate when the expense workspace is selected, using both color and programmatic current-state semantics.

#### Scenario: Pre-create dinner expense
- **WHEN** the organizer creates a dinner expense before the event without entering an amount
- **THEN** the system stores the amount as pending rather than zero

### Requirement: Multiple allocation modes
For each expense with an amount, the editor SHALL support equal allocation, positive-weight allocation, fully custom per-person amounts, and fixed per-person amounts followed by equal or weighted allocation of the remainder. The organizer SHALL be able to exclude any participant from that expense.

#### Scenario: Weighted allocation
- **WHEN** an expense is assigned weights 1, 1, and 0.5 to three included participants
- **THEN** the system allocates the entire expense proportionally to those weights

#### Scenario: Fixed amount then split remainder
- **WHEN** one participant receives a fixed amount and the remaining participants are configured to split the balance equally
- **THEN** the system subtracts the fixed amount and distributes exactly the remaining cents among the others

### Requirement: Exact cent conservation
The settlement engine SHALL represent currency as integer cents and SHALL use a deterministic largest-remainder rule whenever proportional shares do not divide evenly. The allocated cents SHALL equal the expense amount exactly.

#### Scenario: Split one yuan among three people
- **WHEN** ¥1.00 is equally allocated among three participants
- **THEN** the result contains two ¥0.33 shares and one deterministic ¥0.34 share totaling ¥1.00

### Requirement: Explicit unallocated amount
In custom or partially fixed allocation, the editor SHALL display the signed difference between the expense amount and assigned shares. A non-zero difference SHALL be permitted in draft or organizing-in-progress data but SHALL block completed settlement.

#### Scenario: Save partially allocated draft
- **WHEN** a ¥300 expense has only ¥250 assigned in custom mode
- **THEN** the editor shows ¥50 unallocated, permits draft export, and refuses completed settlement status

### Requirement: Multiple payers
Each expense SHALL support one or more payers with explicit paid amounts. The total paid amount SHALL equal the expense amount before settlement can be completed.

#### Scenario: Two people advance one expense
- **WHEN** one participant pays ¥400 and another pays ¥200 for a ¥600 expense
- **THEN** both advances are included independently in their personal net balances

### Requirement: Personal totals and compact transfers
The settlement engine SHALL calculate each participant's confirmed consumption, advances, and net balance, and SHALL generate a deterministic, balanced, acyclic compact transfer plan between debtors and creditors for complete settlement data.

#### Scenario: Calculate payer reimbursement
- **WHEN** one participant advances the complete amount for an equally shared expense
- **THEN** the payer's receivable and the other participants' payable transfers reconcile every participant's net balance to zero

### Requirement: Settlement lifecycle
The system SHALL support `未开始`, `整理中`, and `已完成` settlement states. Pending expenses SHALL be shown as awaiting publication in the first state; confirmed portions MAY be displayed with a non-final warning in the second state; full personal totals and transfers SHALL be displayed in the completed state.

#### Scenario: Partially confirmed settlement
- **WHEN** at least one expense is confirmed and the organizer publishes the activity as organizing-in-progress
- **THEN** the viewer displays confirmed amounts with a clear warning that totals may change

### Requirement: Completed-settlement invariants
The system SHALL allow completed settlement only when every expense has an amount, each expense's allocations equal its amount, each expense's payer amounts equal its amount, and the sum of all participant net balances is zero.

#### Scenario: Complete balanced settlement
- **WHEN** all expenses and payer records satisfy every invariant
- **THEN** the editor allows the organizer to mark settlement completed and the viewer displays the final transfer plan

#### Scenario: Reject incomplete payer records
- **WHEN** allocations are complete but payer amounts do not sum to an expense amount
- **THEN** the editor identifies the payer imbalance and refuses completed settlement

### Requirement: Expandable calculation detail
The viewer SHALL show `我的账单`, `我的转账`, and `全部结算` sections and SHALL allow each expense to be expanded to reveal its station/global association, allocation mode, shares, and advances.

#### Scenario: Inspect one station expense
- **WHEN** a participant expands a station-linked dinner expense
- **THEN** the viewer displays the station, allocation method, included shares, and payer amounts used in the calculation
