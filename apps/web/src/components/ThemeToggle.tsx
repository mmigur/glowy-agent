import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";
import { Button } from "./ui/button";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label={`Switch to ${next} theme`} className="w-8 px-0">
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
