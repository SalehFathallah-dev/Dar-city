import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from './ui';

export const CHART_COLORS = ['#182A5C', '#1E7FC2', '#C0283A', '#4DB6E6', '#5B6FA8', '#BFDDF2', '#6B7280', '#17649C', '#9FB4DC', '#2F855A'];
const AVAIL_COLORS: Record<string, string> = {
  'FULLY AVAILABLE': '#2F855A', 'MODIFIED TRAINING': '#1E7FC2', 'INDIVIDUAL TRAINING': '#4DB6E6', 'NOT AVAILABLE': '#C0283A', 'UNDER MEDICAL REVIEW': '#5B6FA8',
};
const tooltipStyle = { borderRadius: 10, border: '1px solid #e5e5e5', fontSize: 12 };

type Datum = { name: string; value: number };

export function HBarChart({ data, height, unit = 'Injuries', color = '#1E7FC2' }: { data: Datum[]; height?: number; unit?: string; color?: string }) {
  if (!data.length) return <EmptyState title="No data for this period" />;
  const h = height ?? Math.max(180, data.length * 30 + 30);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#eee" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, unit]} cursor={{ fill: '#F2F6FB' }} />
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
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, unit]} cursor={{ fill: '#F2F6FB' }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={34}>
          {data.map((d, i) => <Cell key={d.name} fill={colorful ? CHART_COLORS[i % CHART_COLORS.length] : '#182A5C'} />)}
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
        <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
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
        <Line type="monotone" dataKey="injuries" name="Injuries" stroke="#1E7FC2" strokeWidth={3} dot={{ r: 4, fill: '#182A5C', strokeWidth: 0 }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
