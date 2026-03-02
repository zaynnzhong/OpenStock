"use client";

import { useRef, useCallback, useEffect } from "react";

interface DateInputProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

/**
 * Uncontrolled date input wrapper that preserves native browser segment
 * navigation (auto-advancing from year → month → day when typing).
 * React controlled inputs reset the cursor position on re-render,
 * breaking the auto-advance behavior.
 */
export default function DateInput({ value, onChange, className }: DateInputProps) {
    const ref = useRef<HTMLInputElement>(null);

    // Sync external value changes into the DOM (e.g. form reset)
    useEffect(() => {
        if (ref.current && ref.current.value !== value) {
            ref.current.value = value;
        }
    }, [value]);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value);
        },
        [onChange]
    );

    return (
        <input
            ref={ref}
            type="date"
            defaultValue={value}
            onChange={handleChange}
            className={className}
        />
    );
}
