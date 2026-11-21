// FRSim Rebuilt Beta v35 selectable roster. Turn rates include the game's 0.45 stick multiplier.
interface PlannerRobot {
  id: number;
  label: string;
  team: string;
  region: string;
  maxVel: number;
  maxOmega: number;
  maxAccel: number;
}

export const PLANNER_ROBOTS: PlannerRobot[] = [
  { id: 254, label: "254 · Overload", team: "The Cheesy Poofs", region: "San Jose, California", maxVel: 4.4, maxOmega: 4.95, maxAccel: 10 },
  { id: 971, label: "971 · Mixtape", team: "Spartan Robotics", region: "Mountain View, California", maxVel: 4.4, maxOmega: 4.725, maxAccel: 9 },
  { id: 1114, label: "1114 · Simbot Tim", team: "Simbotics", region: "St. Catharines, Ontario", maxVel: 4.02, maxOmega: 4.491, maxAccel: 8 },
  { id: 1323, label: "1323 · 1323", team: "MadTown Robotics", region: "Madera, California", maxVel: 4.9, maxOmega: 4.725, maxAccel: 11 },
  { id: 1360, label: "1360 · Andromeda", team: "Orbit Robotics", region: "Oakville, Ontario", maxVel: 4.95, maxOmega: 4.725, maxAccel: 9.5 },
  { id: 1678, label: "1678 · Limestone", team: "Citrus Circuits", region: "Davis, California", maxVel: 4.4, maxOmega: 5.1075, maxAccel: 9.5 },
  { id: 1690, label: "1690 · KEPLER", team: "Orbit", region: "Binyamina, Israel", maxVel: 4.4, maxOmega: 4.95, maxAccel: 10 },
  { id: 1706, label: "1706 · Mirage", team: "Ratchet Rockers", region: "Wentzville, Missouri", maxVel: 4.5, maxOmega: 4.725, maxAccel: 9 },
  { id: 1833, label: "1833 · Clover", team: "Team BEAN", region: "Cumming, Georgia", maxVel: 4.39, maxOmega: 4.239, maxAccel: 9.5 },
  { id: 2056, label: "2056 · Desperate Measures", team: "OP Robotics", region: "Stoney Creek, Ontario", maxVel: 4.5, maxOmega: 4.95, maxAccel: 10 },
  { id: 2481, label: "2481 · Clyde", team: "Roboteers", region: "Tremont, Illinois", maxVel: 4.3, maxOmega: 4.725, maxAccel: 12 },
  { id: 2910, label: "2910 · Re•Blitz", team: "Jack in the Bot v2", region: "Mill Creek, Washington", maxVel: 5.1, maxOmega: 5.04, maxAccel: 10 },
  { id: 4414, label: "4414 · RIPCURRENT", team: "HighTide", region: "Ventura, California", maxVel: 4.3, maxOmega: 4.725, maxAccel: 12 },
  { id: 4946, label: "4946 · MOTO MOTO", team: "The Alpha Dogs", region: "Bolton, Ontario", maxVel: 4.39, maxOmega: 4.725, maxAccel: 11 },
  { id: 5000, label: "5000 · Icarus 2.0", team: "Hammerheads", region: "Hingham, Massachusetts", maxVel: 4.5, maxOmega: 4.725, maxAccel: 10 },
  { id: 6329, label: "6329 · Roman II", team: "The Bucks' Wrath", region: "Bucksport, Maine", maxVel: 4.3, maxOmega: 4.05, maxAccel: 8 },
  { id: 7558, label: "7558 · Vanguard", team: "ALT-F4", region: "Toronto, Ontario", maxVel: 4.5, maxOmega: 4.86, maxAccel: 9 },
  { id: 7769, label: "7769 · CHUNK", team: "The CREW", region: "Royal Oak, Michigan", maxVel: 4.39, maxOmega: 4.725, maxAccel: 9 },
  { id: 9785, label: "9785 · Lickitung", team: "Alectrona", region: "Aurora, Ontario", maxVel: 4.9, maxOmega: 4.725, maxAccel: 11 },
  { id: 60026, label: "9999 · Competitive Concept", team: "West Coast Products", region: "Simi Valley, California", maxVel: 4.4, maxOmega: 4.725, maxAccel: 10 },
];

export const plannerRobot = (id?: number) => PLANNER_ROBOTS.find(robot => robot.id === id);
