import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface BasenameInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function BasenameInput({ value, onChange, error }: BasenameInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor="basename">Basename/ENS</Label>
      <Input
        id="basename"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Enter basename or ENS name"
        className={error ? "border-red-500" : ""}
      />
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
} 