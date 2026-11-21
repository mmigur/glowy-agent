import { Moon, Sun } from "lucide-react";
import { appCopy } from "../lib/app-copy";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { Button } from "./ui/button";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { locale } = useI18n();
  const label = theme === "dark" ? appCopy[locale].themeToLight : appCopy[locale].themeToDark;
  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label={label} className="w-8 px-0">
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
