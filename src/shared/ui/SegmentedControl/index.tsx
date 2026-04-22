import s from './SegmentedControl.module.css';

interface Option<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  wrap?: boolean;
}

export function SegmentedControl<T extends string>({ options, value, onChange, size = 'md', wrap = false }: Props<T>) {
  return (
    <div className={`${s.seg} ${s[size]} ${wrap ? s.wrap : ''}`}>
      {options.map(opt => (
        <button
          key={opt.value}
          className={value === opt.value ? s.on : ''}
          onClick={() => onChange(opt.value)}
          title={opt.title}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
