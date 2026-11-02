import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from './ui';

export const CHART_COLORS = ['#F4511E', '#242424', '#D91E36', '#D8CCAE', '#9A7B4F', '#F79A72', '#6B6B6B', '#B8152B', '#E9C46A', '#4A4A4A'];
const AVAIL_COLORS: Record<string, string> = {
  'FULLY AVAILABLE': '#16a34a', 'MODIFIED TRAINING': '#F4511E', 'INDIVIDUAL TRAINING': '#D8CCAE', 'NOT AVAILABLE': '#D91E36', 'UNDER MEDICAL REVIEW': '#0ea5e9',
};
const tooltipStyle = { borderRadius: 10, border: '1px solid #e5e5e5', fontSize: 12 };

type Datum = { name: string; value: number };

export function HBarChart({ data, height, unit = 'Injuries', color = '#F4511E' }: { data: Datum[]; height?: number; unit?: string; color?: string }) {
  if (!data.length) return <EmptyState title="No data for this period" />;
  const h = height ?? Math.max(180, data.length * 30 + 30);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#eee" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, unit]} cursor={{ fill: '#F3EFE4' }} />
        <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VBarChart({ data, unit = 'Injuries', height = 240, colorful }: { data: Datum[]; unit?: string; height?: number; colorful?: boolean }) {
  if (!data.length) return <EmptyState title="No data for this period" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#eee" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={data.length > 4 ? -20 : 0} textAnchor={data.length > 4 ? 'end' : 'middle'} height={data.length > 4 ? 50 : 30} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, unit]} cursor={{ fill: '#F3EFE4' }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={34}>
          {data.map((d, i) => <Cell key={d.name} fill={colorful ? CHART_COLORS[i % CHART_COLORS.length] : '#242424'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 240, availability }: { data: Datum[]; height?: number; availability?: boolean }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <EmptyState title="No data for this period" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
          {data.map((d, i) => <Cell key={d.name} fill={availability ? AVAIL_COLORS[d.name] ?? CHART_COLORS[i] : CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data, height = 240 }: { data: { month: string; injuries: number }[]; height?: number }) {
  if (!data.length) return <EmptyState title="No data for this period" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -16, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#eee" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="injuries" name="Injuries" stroke="#F4511E" strokeWidth={3} dot={{ r: 4, fill: '#D91E36', strokeWidth: 0 }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
