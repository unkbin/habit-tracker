import {
  Apple,
  Bed,
  Bike,
  BookOpen,
  Brain,
  CircleCheck,
  Droplet,
  Dumbbell,
  Footprints,
  Heart,
  Leaf,
  Moon,
  Music,
  PenLine,
  PiggyBank,
  Sun,
  type LucideIcon,
} from "lucide-react";

/** The icons users can pick for a habit. The key is what the API stores. */
export const HABIT_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  droplet: { icon: Droplet, label: "Water" },
  dumbbell: { icon: Dumbbell, label: "Workout" },
  footprints: { icon: Footprints, label: "Walk" },
  bike: { icon: Bike, label: "Cycle" },
  book: { icon: BookOpen, label: "Read" },
  pen: { icon: PenLine, label: "Write" },
  brain: { icon: Brain, label: "Learn" },
  leaf: { icon: Leaf, label: "Meditate" },
  apple: { icon: Apple, label: "Eat well" },
  bed: { icon: Bed, label: "Sleep" },
  sun: { icon: Sun, label: "Morning" },
  moon: { icon: Moon, label: "Evening" },
  heart: { icon: Heart, label: "Health" },
  music: { icon: Music, label: "Practice" },
  "piggy-bank": { icon: PiggyBank, label: "Save" },
  check: { icon: CircleCheck, label: "General" },
};

export function HabitIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = HABIT_ICONS[name]?.icon ?? CircleCheck;
  return <Icon size={size} aria-hidden="true" />;
}
