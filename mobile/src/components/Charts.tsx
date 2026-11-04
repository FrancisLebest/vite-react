import React, {useState} from 'react';
import {LayoutChangeEvent, Text, View} from 'react-native';
import Svg, {Circle, Line, Path, Rect} from 'react-native-svg';
import {t} from '../i18n';
import {font, makeStyles, spacing, useTheme} from '../theme';
import {formatCount} from '../utils/responsive';

export interface Point {
  label: string;
  value: number;
}

const H = 150;
const PAD = {top: 12, bottom: 22, left: 4, right: 4};

/** Max with headroom, never 0 (flat series still draw). */
export function niceMax(values: number[]): number {
  const m = Math.max(0, ...values);
  if (m <= 4) {
    return 4;
  }
  const mag = Math.pow(10, Math.floor(Math.log10(m)));
  return Math.ceil(m / mag) * mag;
}

export function linePath(values: number[], w: number, h: number, max: number): string {
  if (!values.length) {
    return '';
  }
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values
    .map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(' ');
}

function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)] as const;
}

/** Daily line chart (views) with area fill and min/max labels. */
export function LineChart({data, color, label}: {data: Point[]; color?: string; label: string}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const [w, onLayout] = useWidth();
  const values = data.map(d => d.value);
  const max = niceMax(values);
  const innerW = Math.max(0, w - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const stroke = color ?? colors.primary;
  const path = linePath(values, innerW, innerH, max);
  const area = path ? `${path} L${innerW},${innerH} L0,${innerH} Z` : '';
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <View
      onLayout={onLayout}
      style={styles.chart}
      accessible
      accessibilityLabel={t('{label}: {total} over {days} days, peak {max}', {
        label,
        total,
        days: data.length,
        max: Math.max(0, ...values),
      })}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          {[0, 0.5, 1].map(f => (
            <Line
              key={f}
              x1={PAD.left}
              x2={w - PAD.right}
              y1={PAD.top + innerH * f}
              y2={PAD.top + innerH * f}
              stroke={colors.border}
              strokeWidth={1}
            />
          ))}
          <Path d={area} fill={stroke} opacity={0.12} transform={`translate(${PAD.left},${PAD.top})`} />
          <Path
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth={2.5}
            strokeLinejoin="round"
            transform={`translate(${PAD.left},${PAD.top})`}
          />
          {values.length === 1 ? (
            <Circle cx={PAD.left} cy={PAD.top + innerH - (values[0] / max) * innerH} r={4} fill={stroke} />
          ) : null}
        </Svg>
      ) : null}
      <View style={styles.axis}>
        <Text style={styles.axisText}>{data[0]?.label}</Text>
        <Text style={styles.axisText}>{t('max {n}', {n: formatCount(max)})}</Text>
        <Text style={styles.axisText}>{data[data.length - 1]?.label}</Text>
      </View>
    </View>
  );
}

/** Daily bars (likes / comments / followers). */
export function BarChart({data, color, label}: {data: Point[]; color?: string; label: string}) {
  const styles = useStyles();
  const {colors} = useTheme();
  const [w, onLayout] = useWidth();
  const values = data.map(d => d.value);
  const max = niceMax(values);
  const innerW = Math.max(0, w - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const slot = data.length ? innerW / data.length : 0;
  const barW = Math.max(1, slot * 0.65);
  const fill = color ?? colors.primary;
  return (
    <View
      onLayout={onLayout}
      style={styles.chart}
      accessible
      accessibilityLabel={t('{label}: {total} over {days} days', {
        label,
        total: values.reduce((a, b) => a + b, 0),
        days: data.length,
      })}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          <Line
            x1={PAD.left}
            x2={w - PAD.right}
            y1={PAD.top + innerH}
            y2={PAD.top + innerH}
            stroke={colors.border}
            strokeWidth={1}
          />
          {values.map((v, i) => {
            const bh = (v / max) * innerH;
            return (
              <Rect
                key={i}
                x={PAD.left + i * slot + (slot - barW) / 2}
                y={PAD.top + innerH - bh}
                width={barW}
                height={Math.max(bh, v > 0 ? 2 : 0)}
                rx={Math.min(3, barW / 2)}
                fill={fill}
              />
            );
          })}
        </Svg>
      ) : null}
      <View style={styles.axis}>
        <Text style={styles.axisText}>{data[0]?.label}</Text>
        <Text style={styles.axisText}>{t('max {n}', {n: formatCount(max)})}</Text>
        <Text style={styles.axisText}>{data[data.length - 1]?.label}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  chart: {height: H, marginTop: spacing.sm},
  axis: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisText: {fontSize: font.xs, color: c.textMuted},
}));
