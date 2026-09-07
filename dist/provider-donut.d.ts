export type ProviderDonutDatum = {
    id: string;
    label: string;
    value: number;
    color: string;
};
type ProviderDonutProps = {
    data: ProviderDonutDatum[];
    valueFormatter?: (value: number) => string;
    centerLabel?: string;
    ariaLabel?: string;
};
export declare function ProviderDonut({ data, valueFormatter, centerLabel, ariaLabel, }: ProviderDonutProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=provider-donut.d.ts.map