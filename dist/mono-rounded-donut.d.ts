export type MonoRoundedDonutDatum = {
    id: string;
    label: string;
    value: number;
    color: string;
};
type MonoRoundedDonutProps = {
    data: MonoRoundedDonutDatum[];
    valueFormatter?: (value: number) => string;
    centerLabel?: string;
    ariaLabel?: string;
};
export declare function MonoRoundedDonut({ data, valueFormatter, centerLabel, ariaLabel, }: MonoRoundedDonutProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=mono-rounded-donut.d.ts.map