import { useMemo } from 'react';

interface AimCurveGraphProps {
  exponent: number;
  accelCurve: { speed: number; mult: number }[];
  deadzone: number;
  maxSpeed: number;
}

const PAD = { top: 14, right: 12, bottom: 24, left: 34 };
const STEPS = 120;
const ACCEL_W = 90;
const ACCEL_H = 60;
const ACCEL_PAD = 6;

function responseCurvePoint(x: number, deadzone: number, exponent: number, maxSpeed: number): number {
  if (x <= deadzone) return 0;
  const rescaled = (x - deadzone) / (1 - deadzone);
  const curved = Math.pow(rescaled, exponent);
  return curved * maxSpeed;
}

function buildPolyline(
  points: { x: number; y: number }[],
  ox: number, oy: number, w: number, h: number,
  xMax: number, yMax: number,
): string {
  return points
    .map((p) => {
      const px = ox + (p.x / xMax) * w;
      const py = oy + h - (p.y / yMax) * h;
      return `${px},${py}`;
    })
    .join(' ');
}

export default function AimCurveGraph({ exponent, accelCurve, deadzone, maxSpeed }: AimCurveGraphProps) {
  const curvePoints = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const x = i / STEPS;
      const y = responseCurvePoint(x, deadzone, exponent, maxSpeed);
      pts.push({ x, y });
    }
    return pts;
  }, [deadzone, exponent, maxSpeed]);

  const accelBounds = useMemo(() => {
    if (accelCurve.length === 0) return null;
    const xMax = Math.max(...accelCurve.map((p) => p.speed), 1);
    const yMax = Math.max(...accelCurve.map((p) => p.mult), 1);
    return { xMax, yMax };
  }, [accelCurve]);

  const VB_W = 360;
  const VB_H = 200;
  const chartW = VB_W - PAD.left - PAD.right;
  const chartH = VB_H - PAD.top - PAD.bottom;
  const gridLines = 4;

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={200} style={{ display: 'block' }}>
        {/* Background */}
        <rect x={0} y={0} width={VB_W} height={VB_H} rx={8} ry={8} fill="#0c0d11" />

        <defs>
          <clipPath id="chart-clip">
            <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} />
          </clipPath>
        </defs>

        {/* Grid */}
        {Array.from({ length: gridLines + 1 }, (_, i) => {
          const frac = i / gridLines;
          const gx = PAD.left + frac * chartW;
          const gy = PAD.top + chartH - frac * chartH;
          return (
            <g key={`grid-${i}`}>
              <line x1={gx} y1={PAD.top} x2={gx} y2={PAD.top + chartH} stroke="#ffffff08" strokeWidth={0.5} />
              <line x1={PAD.left} y1={gy} x2={PAD.left + chartW} y2={gy} stroke="#ffffff08" strokeWidth={0.5} />
            </g>
          );
        })}

        {/* Chart border */}
        <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} fill="none" stroke="#ffffff10" strokeWidth={0.5} />

        {/* 1:1 reference */}
        <line
          x1={PAD.left} y1={PAD.top + chartH}
          x2={PAD.left + chartW} y2={PAD.top}
          stroke="#4a4e5e" strokeWidth={0.8} strokeDasharray="4 3"
          clipPath="url(#chart-clip)"
        />

        {/* Deadzone shading */}
        {deadzone > 0 && (
          <rect x={PAD.left} y={PAD.top} width={deadzone * chartW} height={chartH} fill="rgba(239,68,68,0.06)" />
        )}

        {/* Response curve */}
        <polyline
          points={buildPolyline(curvePoints, PAD.left, PAD.top, chartW, chartH, 1, 1)}
          fill="none" stroke="#f97316" strokeWidth={2} strokeLinejoin="round"
          clipPath="url(#chart-clip)"
        />

        {/* Axis labels */}
        <text x={PAD.left + chartW / 2} y={VB_H - 2} textAnchor="middle" fill="#4a4e5e" fontSize={9}>Input</text>
        <text
          x={4} y={PAD.top + chartH / 2} textAnchor="middle" fill="#4a4e5e" fontSize={9}
          transform={`rotate(-90, 4, ${PAD.top + chartH / 2})`}
        >Output</text>

        {/* Tick values */}
        {[0, 0.5, 1].map((v) => (
          <text key={`xt-${v}`} x={PAD.left + v * chartW} y={PAD.top + chartH + 11} textAnchor="middle" fill="#4a4e5e" fontSize={7}>{v}</text>
        ))}
        {[0, 0.5, 1].map((v) => (
          <text key={`yt-${v}`} x={PAD.left - 4} y={PAD.top + chartH - v * chartH + 3} textAnchor="end" fill="#4a4e5e" fontSize={7}>{v}</text>
        ))}

        {/* Exponent label */}
        <text x={PAD.left + chartW - 2} y={PAD.top + 10} textAnchor="end" fill="#f9731666" fontSize={8}>
          exp {exponent.toFixed(2)}
        </text>

        {/* Acceleration curve inset */}
        {accelBounds && accelCurve.length > 0 && (() => {
          const ax = PAD.left + chartW - ACCEL_W - ACCEL_PAD;
          const ay = PAD.top + chartH - ACCEL_H - ACCEL_PAD;
          const sorted = [...accelCurve].sort((a, b) => a.speed - b.speed);
          return (
            <g>
              <rect x={ax} y={ay} width={ACCEL_W} height={ACCEL_H} rx={4} ry={4}
                    fill="#0c0d11" stroke="#ffffff0c" strokeWidth={0.5} />
              <defs>
                <clipPath id="accel-clip">
                  <rect x={ax} y={ay} width={ACCEL_W} height={ACCEL_H} />
                </clipPath>
              </defs>
              <polyline
                points={buildPolyline(
                  sorted.map((p) => ({ x: p.speed, y: p.mult })),
                  ax, ay, ACCEL_W, ACCEL_H,
                  accelBounds.xMax, accelBounds.yMax,
                )}
                fill="none" stroke="#3b82f6" strokeWidth={1.4} strokeLinejoin="round"
                clipPath="url(#accel-clip)"
              />
              {sorted.map((p, i) => {
                const px = ax + (p.speed / accelBounds.xMax) * ACCEL_W;
                const py = ay + ACCEL_H - (p.mult / accelBounds.yMax) * ACCEL_H;
                return <circle key={`ap-${i}`} cx={px} cy={py} r={2} fill="#3b82f6" clipPath="url(#accel-clip)" />;
              })}
              <text x={ax + 4} y={ay + 9} fill="#3b82f666" fontSize={7}>Accel</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
