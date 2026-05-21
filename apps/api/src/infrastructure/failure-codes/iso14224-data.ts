/**
 * ISO 14224:2016 Failure taxonomy — Equipment × Failure Mode hierarchy.
 *
 * Structure:
 *   Category (top-level: Mechanical, Electrical, Instrumentation, …)
 *     └─ System    (e.g. Rotating, Static, Electrical Distribution)
 *          └─ Code (e.g. MECH-ROT-001 Bearing Failure)
 *
 * Only a representative subset is included here.  The full taxonomy (~600
 * codes) should be imported via CSV using the `importFromCSV` method.
 */
export interface ISO14224Code {
  code: string
  name: string
  category: string
  system: string
  notes: string
}

export const ISO14224_SEED_DATA: ISO14224Code[] = [
  // ── Mechanical — Rotating Equipment ────────────────────────────────────────
  {
    code: 'MECH-ROT-001',
    name: 'Bearing Failure',
    category: 'Mechanical',
    system: 'Rotating Equipment',
    notes: 'Premature wear, fatigue, or contamination of rolling-element or plain bearing.',
  },
  {
    code: 'MECH-ROT-002',
    name: 'Shaft Misalignment',
    category: 'Mechanical',
    system: 'Rotating Equipment',
    notes: 'Angular or parallel misalignment between coupled shafts.',
  },
  {
    code: 'MECH-ROT-003',
    name: 'Imbalance',
    category: 'Mechanical',
    system: 'Rotating Equipment',
    notes: 'Mass distribution unequal around the rotational axis.',
  },
  {
    code: 'MECH-ROT-004',
    name: 'Seal Leakage',
    category: 'Mechanical',
    system: 'Rotating Equipment',
    notes: 'Mechanical seal or packing allowing process fluid to escape.',
  },
  {
    code: 'MECH-ROT-005',
    name: 'Vibration — Excessive',
    category: 'Mechanical',
    system: 'Rotating Equipment',
    notes: 'Vibration amplitude exceeds ISO 10816 limits.',
  },
  {
    code: 'MECH-ROT-006',
    name: 'Coupling Failure',
    category: 'Mechanical',
    system: 'Rotating Equipment',
    notes: 'Flexible or rigid coupling element fractured or worn.',
  },
  {
    code: 'MECH-ROT-007',
    name: 'Cavitation',
    category: 'Mechanical',
    system: 'Rotating Equipment',
    notes: 'Vapour bubble formation and collapse in pump impeller.',
  },
  {
    code: 'MECH-ROT-008',
    name: 'Overheating — Bearing',
    category: 'Mechanical',
    system: 'Rotating Equipment',
    notes: 'Bearing temperature above rated operating limit.',
  },

  // ── Mechanical — Static Equipment ──────────────────────────────────────────
  {
    code: 'MECH-STA-001',
    name: 'External Corrosion',
    category: 'Mechanical',
    system: 'Static Equipment',
    notes: 'Oxidation or electrochemical attack on external surfaces.',
  },
  {
    code: 'MECH-STA-002',
    name: 'Internal Corrosion',
    category: 'Mechanical',
    system: 'Static Equipment',
    notes: 'Process-fluid driven corrosion on wetted surfaces.',
  },
  {
    code: 'MECH-STA-003',
    name: 'Erosion',
    category: 'Mechanical',
    system: 'Static Equipment',
    notes: 'Material loss due to high-velocity fluid or particle impingement.',
  },
  {
    code: 'MECH-STA-004',
    name: 'Fatigue Crack',
    category: 'Mechanical',
    system: 'Static Equipment',
    notes: 'Cyclic stress crack propagation in pressure vessels or piping.',
  },
  {
    code: 'MECH-STA-005',
    name: 'Flange Leakage',
    category: 'Mechanical',
    system: 'Static Equipment',
    notes: 'Gasket failure or inadequate bolt pre-load at piping flange.',
  },
  {
    code: 'MECH-STA-006',
    name: 'Fouling / Plugging',
    category: 'Mechanical',
    system: 'Static Equipment',
    notes: 'Deposition of scale, wax, or biological material reducing flow.',
  },

  // ── Electrical — Power Distribution ────────────────────────────────────────
  {
    code: 'ELEC-PWR-001',
    name: 'Insulation Failure',
    category: 'Electrical',
    system: 'Power Distribution',
    notes: 'Breakdown of winding or cable insulation causing short circuit.',
  },
  {
    code: 'ELEC-PWR-002',
    name: 'Overload — Motor',
    category: 'Electrical',
    system: 'Power Distribution',
    notes: 'Motor drawing current above rated FLA, tripping overload relay.',
  },
  {
    code: 'ELEC-PWR-003',
    name: 'Phase Imbalance',
    category: 'Electrical',
    system: 'Power Distribution',
    notes: 'Unequal phase voltages causing negative-sequence current.',
  },
  {
    code: 'ELEC-PWR-004',
    name: 'Contactor / Relay Failure',
    category: 'Electrical',
    system: 'Power Distribution',
    notes: 'Contact welding, coil burn-out, or mechanical failure.',
  },
  {
    code: 'ELEC-PWR-005',
    name: 'Ground Fault',
    category: 'Electrical',
    system: 'Power Distribution',
    notes: 'Unintended conductive path from energised conductor to earth.',
  },
  {
    code: 'ELEC-PWR-006',
    name: 'VFD / Drive Fault',
    category: 'Electrical',
    system: 'Power Distribution',
    notes: 'Variable-frequency drive fault code; over-current, over-voltage, or thermal.',
  },

  // ── Instrumentation & Control ───────────────────────────────────────────────
  {
    code: 'INST-CTL-001',
    name: 'Transmitter Out of Range',
    category: 'Instrumentation',
    system: 'Control Systems',
    notes: 'Process transmitter reading beyond 4–20 mA span or HART range.',
  },
  {
    code: 'INST-CTL-002',
    name: 'Sensor Drift',
    category: 'Instrumentation',
    system: 'Control Systems',
    notes: 'Gradual offset of measurement vs calibration reference.',
  },
  {
    code: 'INST-CTL-003',
    name: 'Control Valve Stuck',
    category: 'Instrumentation',
    system: 'Control Systems',
    notes: 'Valve stem or actuator unable to follow positioner command.',
  },
  {
    code: 'INST-CTL-004',
    name: 'Instrument Air Failure',
    category: 'Instrumentation',
    system: 'Control Systems',
    notes: 'Loss of pneumatic supply to actuators or positioners.',
  },
  {
    code: 'INST-CTL-005',
    name: 'Loop Failure',
    category: 'Instrumentation',
    system: 'Control Systems',
    notes: 'Open or short circuit in 4–20 mA control loop wiring.',
  },

  // ── Structural ──────────────────────────────────────────────────────────────
  {
    code: 'STRU-CIV-001',
    name: 'Foundation Settlement',
    category: 'Structural',
    system: 'Civil Structures',
    notes: 'Differential settlement causing equipment misalignment.',
  },
  {
    code: 'STRU-CIV-002',
    name: 'Concrete Spalling',
    category: 'Structural',
    system: 'Civil Structures',
    notes: 'Delamination of concrete cover exposing reinforcement.',
  },
  {
    code: 'STRU-STL-001',
    name: 'Structural Weld Crack',
    category: 'Structural',
    system: 'Steel Structures',
    notes: 'Fatigue or stress-corrosion crack at structural weld toe.',
  },

  // ── Process / Operations ────────────────────────────────────────────────────
  {
    code: 'PROC-OPS-001',
    name: 'Process Upset — Over-pressure',
    category: 'Process',
    system: 'Operations',
    notes: 'System pressure exceeding rated design pressure.',
  },
  {
    code: 'PROC-OPS-002',
    name: 'Process Upset — Over-temperature',
    category: 'Process',
    system: 'Operations',
    notes: 'Fluid or equipment surface temperature above design limit.',
  },
  {
    code: 'PROC-OPS-003',
    name: 'Contamination',
    category: 'Process',
    system: 'Operations',
    notes: 'Introduction of foreign material into process stream.',
  },
]
