import { 
  CheckSquare, 
  Moon, 
  Hourglass, 
  Crown, 
  MessageSquare, 
  Settings, 
  LogOut, 
  HelpCircle, 
  Link as LinkIcon,
  AlertTriangle,
  Timer,
  Trophy,
  PlusSquare,
  Gavel,
  X,
  Medal
} from "@/components/ui/CyberIcons";

/**
 * Cyber-Pixel Icon Mapping
 * Centralizes all icon choices to ensure visual consistency.
 */
export const PIXEL_ICONS = {
  // Status Emojis Replacements
  SUCCESS: CheckSquare,
  OFFLINE: Moon,
  WAITING: Hourglass,
  
  // Feature Icons
  LEADING: Crown,
  CHAT: MessageSquare,
  ORGANIZER: Settings,
  LEAVE: LogOut,
  HOW_TO_USE: HelpCircle,
  LINKS: LinkIcon,
  WARNING: AlertTriangle,
  TIMER: Timer,
  FINISH: Trophy,
  CREATE: PlusSquare,
  SOLD: Gavel,
  CLOSE: X,
  MEDAL: Medal,
} as const;
