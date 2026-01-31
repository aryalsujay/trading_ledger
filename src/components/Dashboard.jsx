import React, { useState, useEffect, useMemo } from 'react';
import { useMembers } from '../contexts/MemberContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { fetchDashboardStats } from '../api';

const COLORS = {
    success: '#10b981',
    danger: '#ef4444',
    text: '#e4e7eb',
    textSecondary: '#9ca3b5',
    bgSecondary: '#13182E',
    border: '#2a3152',
    primary: '#6366f1'
};

function Dashboard() {
    const { selectedMember, setSelectedMember, members } = useMembers();
    const [monthlyStats, setMonthlyStats] = useState([]);
    const [growthData, setGrowthData] = useState([]);
    const [topSymbols, setTopSymbols] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filters
    const [timeRange, setTimeRange] = useState('ALL'); // ALL, 1Y, 6M, 3M, CUSTOM, or 'YYYY-MM'
    const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });

    useEffect(() => {
        // Initial fetch or when member changes (defaults to ALL or preserved range)
        if (timeRange !== 'CUSTOM') {
            fetchData();
        }
    }, [selectedMember, timeRange]);

    // Fetch when Custom Range is applied (manual trigger usually, but here we can check validity)
    const handleApplyCustomRange = () => {
        if (timeRange === 'CUSTOM' && customDateRange.start && customDateRange.end) {
            fetchData();
        }
    };

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (selectedMember) params.append('member_id', selectedMember.id);

            // Date Filters
            let startDate, endDate;
            const now = new Date();

            if (timeRange === '1Y') {
                startDate = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString().split('T')[0];
            } else if (timeRange === '6M') {
                startDate = new Date(now.setMonth(now.getMonth() - 6)).toISOString().split('T')[0];
            } else if (timeRange === '3M') {
                startDate = new Date(now.setMonth(now.getMonth() - 3)).toISOString().split('T')[0];
            } else if (timeRange === 'CUSTOM') {
                if (customDateRange.start) startDate = customDateRange.start;
                if (customDateRange.end) endDate = customDateRange.end;
            } else if (timeRange.match(/^\d{4}-\d{2}$/)) {
                // Specific MonthYYYY-MM
                // handled by backend "month" logic? 
                // Actually, for specific month filter in backend, we can set start/end to first/last of that month
                // But current UI uses "month" column in frontend filter for that specific dropdown case (legacy logic).
                // We will keep legacy logic for "Specific Month Picker" purely frontend if we want, OR convert to range.
                // Let's stick to frontend aggregation for the 'YYYY-MM' dropdown to calculate the "Specific Month" view?
                // No, "Monthly Performance" endpoint returns monthly buckets. 
                // If I select "2023-10", I just want to see that row?
                // Let's just keep 'startDate' empty for specific month selection and let the existing frontend filter handle the specific row picking
                // UNLESS we want to filter the Capital Growth chart too? Yes.
                // So:
                const [y, m] = timeRange.split('-');
                startDate = `${y}-${m}-01`;
                // End date = last day of month
                endDate = new Date(y, m, 0).toISOString().split('T')[0];
            }

            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);

            const queryString = params.toString() ? `?${params.toString()}` : '';

            const [monthlyRes, growthRes, statsRes] = await Promise.all([
                fetch(`http://localhost:3000/api/analytics/monthly-performance${queryString}`),
                fetch(`http://localhost:3000/api/analytics/capital-growth${queryString}`),
                fetchDashboardStats(selectedMember) // Dashboard stats (Top Symbols etc) might need filtering too? 
                // Ideally yes, but 'fetchDashboardStats' is an imported API wrapper. 
                // Converting it to use raw fetch here for consistency or leaving it.
                // It doesn't take date params currently. We can accept that "Top Symbols" is All Time for now.
            ]);

            if (!monthlyRes.ok || !growthRes.ok) throw new Error('Failed to fetch analytics data');

            const monthly = await monthlyRes.json();
            const growth = await growthRes.json();

            // Calculate ROI for monthly stats
            const verifiedMonthly = monthly.map(m => ({
                ...m,
                roi: m.total_investment > 0 ? (m.net_profit / m.total_investment) * 100 : 0
            }));

            setMonthlyStats(verifiedMonthly);
            setGrowthData(growth);
            if (statsRes && statsRes.top_symbols) {
                setTopSymbols(statsRes.top_symbols);
            }

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getMemberName = () => {
        if (!selectedMember) return 'All Members';
        return selectedMember.member_name;
    };

    // Get available months for filter
    const availableMonths = useMemo(() => {
        return monthlyStats.map(m => m.month); // Assuming sorted desc in backend
    }, [monthlyStats]);

    // Filter Data based on Time Range
    // Filter Data based on Time Range (Frontend Filtering - mostly pass-through now since Backend handles it)
    const filteredData = useMemo(() => {
        // Since we fetch filtered data from backend, we just return it.
        // EXCEPT for the "Specific Month" dropdown case where we might receive just that one month's data 
        // OR if we fetched ALL, we filter.
        // Current strategy: We fetch filtered data. So 'monthlyStats' is already filtered.

        return { monthly: monthlyStats, growth: growthData };
    }, [monthlyStats, growthData]);

    // Derived Stats
    const totalStats = useMemo(() => {
        let wins = 0;
        let losses = 0;
        let totalPnl = 0;
        let totalTrades = 0;

        filteredData.monthly.forEach(m => {
            wins += m.winning_trades || 0;
            losses += m.losing_trades || 0;
            totalPnl += m.net_profit || 0;
            totalTrades += m.total_trades || 0;
        });

        const totalInvestmentForPeriod = filteredData.monthly.reduce((acc, m) => acc + (m.total_investment || 0), 0);
        const periodRoi = totalInvestmentForPeriod > 0 ? (totalPnl / totalInvestmentForPeriod) * 100 : 0;

        return { wins, losses, totalPnl, totalTrades, winRate: totalTrades ? ((wins / totalTrades) * 100).toFixed(1) : 0, totalInvestment: totalInvestmentForPeriod, periodRoi };
    }, [filteredData]);

    const pieData = [
        { name: 'Wins', value: totalStats.wins, color: COLORS.success },
        { name: 'Losses', value: totalStats.losses, color: COLORS.danger },
    ];

    if (loading && !growthData.length && !monthlyStats.length) return <div className="container" style={{ padding: '2rem' }}>Loading dashboard...</div>;
    if (error) return <div className="container" style={{ padding: '2rem', color: 'red' }}>Error: {error}</div>;

    const currentCapital = growthData.length > 0 ? growthData[growthData.length - 1].value : 0;
    // If filtering by specific month, show P&L for that month. If ALL/Range, show aggregated.

    return (
        <div className="container page fade-in">
            <header className="page-header flex-between mb-4">
                <div>
                    <h1 className="mb-2">Trading Dashboard</h1>
                    <p className="subtitle" style={{ color: 'var(--color-text-secondary)' }}>
                        Overview for <strong style={{ color: 'var(--color-primary)' }}>{getMemberName()}</strong>
                    </p>
                </div>
                <div className="header-actions flex" style={{ gap: '10px' }}>
                    <div className="flex" style={{ gap: '10px', alignItems: 'center' }}>
                        <select
                            className="form-select"
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                            style={{ width: 'auto', minWidth: '130px' }}
                        >
                            <option value="ALL">All Time</option>
                            <option value="CUSTOM">Custom Range</option>
                            <optgroup label="Ranges">
                                <option value="1Y">Last 1 Year</option>
                                <option value="6M">Last 6 Months</option>
                                <option value="3M">Last 3 Months</option>
                            </optgroup>
                            {availableMonths.length > 0 && (
                                <optgroup label="Monthly">
                                    {availableMonths.map(month => (
                                        <option key={month} value={month}>
                                            {new Date(month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                        </select>

                        {timeRange === 'CUSTOM' && (
                            <div className="flex" style={{ gap: '5px' }}>
                                <input
                                    type="date"
                                    className="form-input"
                                    style={{ padding: '0.4rem', width: 'auto' }}
                                    value={customDateRange.start}
                                    onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })}
                                />
                                <span style={{ color: COLORS.textSecondary }}>to</span>
                                <input
                                    type="date"
                                    className="form-input"
                                    style={{ padding: '0.4rem', width: 'auto' }}
                                    value={customDateRange.end}
                                    onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })}
                                />
                                <button className="btn btn-primary btn-sm" onClick={handleApplyCustomRange}>Apply</button>
                            </div>
                        )}

                        <select
                            className="form-select"
                            style={{ width: 'auto', minWidth: '150px' }}
                            value={selectedMember ? selectedMember.id : ''}
                            onChange={(e) => {
                                const id = e.target.value;
                                if (id === '') setSelectedMember(null);
                                else setSelectedMember(members.find(m => m.id == id));
                            }}
                        >
                            <option value="">👤 All Members</option>
                            {members.map(m => (
                                <option key={m.id} value={m.id}>👤 {m.member_name}</option>
                            ))}
                        </select>
                        <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
                            Refresh
                        </button>
                    </div>
                </div>
            </header>

            {/* Summary Cards */}
            <section className="grid grid-4 mb-4">
                <div className="summary-card">
                    <div className="summary-label">Total Capital</div>
                    <div className="summary-value" style={{ color: COLORS.success }}>
                        ₹{currentCapital.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                    <div className="summary-sublabel">Current Net Worth</div>
                </div>
                <div className="summary-card">
                    <div className="summary-label">Total Investment</div>
                    <div className="summary-value" style={{ color: COLORS.text }}>
                        ₹{totalStats.totalInvestment ? totalStats.totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : 0}
                    </div>
                    <div className="summary-sublabel">Exited Trades Value</div>
                </div>
                <div className="summary-card">
                    <div className="summary-label">ROI %</div>
                    <div className="summary-value" style={{ color: totalStats.periodRoi >= 0 ? COLORS.success : COLORS.danger }}>
                        {totalStats.periodRoi.toFixed(2)}%
                    </div>
                    <div className="summary-sublabel">Return on Investment</div>
                </div>
                <div className="summary-card">
                    <div className="summary-label">Win Rate ({timeRange === 'ALL' ? 'Overall' : 'Period'})</div>
                    <div className="summary-value" style={{ color: totalStats.winRate >= 50 ? COLORS.success : COLORS.text }}>
                        {totalStats.winRate}%
                    </div>
                    <div className="summary-sublabel">{totalStats.wins} Wins / {totalStats.losses} Losses</div>
                </div>
                <div className="summary-card">
                    <div className="summary-label">Net P&L ({timeRange === 'ALL' ? 'Lifetime' : 'Period'})</div>
                    <div className={`summary-value ${totalStats.totalPnl >= 0 ? 'positive' : 'negative'}`}
                        style={{ color: totalStats.totalPnl >= 0 ? COLORS.success : COLORS.danger }}>
                        ₹{totalStats.totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                    <div className="summary-sublabel">Realized Profit/Loss</div>
                </div>
            </section>

            {/* Charts Section */}
            <section className="grid grid-2 mb-4">
                {/* Capital Growth Chart */}
                <div className="card" style={{ height: '420px', padding: '1.5rem 1rem 1rem 0' }}> {/* Added left padding 0, effectively handled by margin in chart */}
                    <h3 className="card-title mb-2" style={{ paddingLeft: '1.5rem', fontSize: '1.2rem' }}>Capital Growth</h3>
                    {growthData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={filteredData.growth} margin={{ top: 10, right: 15, left: 25, bottom: 5 }}> {/* Increased left margin */}
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.8} />
                                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    stroke={COLORS.textSecondary}
                                    tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    tickMargin={10}
                                    minTickGap={30} // Prevent overcrowding
                                />
                                <YAxis
                                    stroke={COLORS.textSecondary}
                                    tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                                />
                                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: COLORS.bgSecondary, borderColor: COLORS.border, color: COLORS.text }}
                                    itemStyle={{ color: COLORS.text }}
                                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                                    formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, '']}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke={COLORS.primary}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorValue)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex-center" style={{ height: '100%', color: COLORS.textSecondary }}>No data for selected period</div>
                    )}
                </div>

                {/* Monthly P&L Chart */}
                <div className="card" style={{ height: '420px', padding: '1.5rem 1rem 1rem 0' }}>
                    <h3 className="card-title mb-2" style={{ paddingLeft: '1.5rem', fontSize: '1.2rem' }}>Monthly Performance</h3>
                    {filteredData.monthly.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[...filteredData.monthly].reverse()} margin={{ top: 10, right: 15, left: 25, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                                <XAxis dataKey="month" stroke={COLORS.textSecondary} tickMargin={10} />
                                <YAxis stroke={COLORS.textSecondary} tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} />
                                <Tooltip
                                    cursor={{ fill: COLORS.bgSecondary, opacity: 0.8 }}
                                    contentStyle={{ backgroundColor: COLORS.bgSecondary, borderColor: COLORS.border, color: COLORS.text }}
                                    formatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                                />
                                <Bar dataKey="net_profit" name="Net Profit">
                                    {
                                        [...filteredData.monthly].reverse().map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.net_profit >= 0 ? COLORS.success : COLORS.danger} />
                                        ))
                                    }
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex-center" style={{ height: '100%', color: COLORS.textSecondary }}>No data for selected period</div>
                    )}
                </div>

                {/* ROI % Chart */}
                <div className="card" style={{ height: '420px', padding: '1.5rem 1rem 1rem 0', gridColumn: 'span 2' }}>
                    <h3 className="card-title mb-2" style={{ paddingLeft: '1.5rem', fontSize: '1.2rem' }}>Monthly Return on Investment (ROI %)</h3>
                    {filteredData.monthly.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={[...filteredData.monthly].reverse()} margin={{ top: 10, right: 15, left: 15, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                                <XAxis dataKey="month" stroke={COLORS.textSecondary} tickMargin={10} />
                                <YAxis stroke={COLORS.textSecondary} tickFormatter={(val) => `${val}%`} />
                                <Tooltip
                                    cursor={{ fill: COLORS.bgSecondary, opacity: 0.8 }}
                                    contentStyle={{ backgroundColor: COLORS.bgSecondary, borderColor: COLORS.border, color: COLORS.text }}
                                    formatter={(value) => [`${value.toFixed(2)}%`, 'ROI']}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="roi"
                                    name="ROI %"
                                    stroke={COLORS.primary}
                                    strokeWidth={3}
                                    dot={{ fill: COLORS.primary, r: 4 }}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex-center" style={{ height: '100%', color: COLORS.textSecondary }}>No data for selected period</div>
                    )}
                </div>
            </section>

            {/* Stats Breakdown Section */}
            <section className="grid grid-3 mb-4">
                {/* Win Rate Pie Chart */}
                <div className="card" style={{ height: '350px', padding: '1rem' }}>
                    <h3 className="card-title text-center mb-2">Win / Loss Ratio</h3>
                    {totalStats.totalTrades > 0 ? (
                        <div style={{ height: '100%', position: 'relative' }}>
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={70} // Thicker donut
                                        outerRadius={95}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: COLORS.bgSecondary, borderColor: COLORS.border, borderRadius: '8px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                            {/* Centered Text */}
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                textAlign: 'center',
                                marginTop: '-10px' // Slight adjust for visual centering
                            }}>
                                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', lineHeight: 1 }}>{totalStats.winRate}%</div>
                                <div style={{ fontSize: '0.8rem', color: COLORS.textSecondary, marginTop: '4px' }}>Win Rate</div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-center" style={{ height: '100%', color: COLORS.textSecondary }}>No trades</div>
                    )}
                </div>

                {/* Detailed Monthly Stats (Table) */}
                <div className="card" style={{ padding: 0, overflow: 'hidden', gridColumn: 'span 2' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>
                        <h3 className="card-title">Breakdown</h3>
                    </div>
                    <div className="table-container" style={{ border: 'none', borderRadius: 0, maxHeight: '300px', overflowY: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ background: COLORS.bgSecondary, position: 'sticky', top: 0 }}>Month</th>
                                    <th className="text-right" style={{ background: COLORS.bgSecondary, position: 'sticky', top: 0 }}>Trades</th>
                                    <th className="text-right" style={{ background: COLORS.bgSecondary, position: 'sticky', top: 0 }}>Win/Loss</th>
                                    <th className="text-right" style={{ background: COLORS.bgSecondary, position: 'sticky', top: 0 }}>Net P&L</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.monthly.map((stat) => (
                                    <tr key={stat.month}>
                                        <td style={{ fontWeight: 600 }}>{stat.month}</td>
                                        <td className="text-right">{stat.total_trades}</td>
                                        <td className="text-right">
                                            <span style={{ color: COLORS.success }}>{stat.winning_trades}W</span> / <span style={{ color: COLORS.danger }}>{stat.losing_trades}L</span>
                                        </td>
                                        <td className="text-right" style={{ fontWeight: 700, color: stat.net_profit >= 0 ? COLORS.success : COLORS.danger }}>
                                            ₹{stat.net_profit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                                                {stat.roi.toFixed(1)}%
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredData.monthly.length === 0 && (
                                    <tr><td colSpan="4" className="text-center" style={{ padding: '1rem', color: COLORS.textSecondary }}>No data found for this period</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* Top Symbols (Optional/Secondary) */}
            <section className="mb-4">
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">Top Performing Symbols (All Time)</h3>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th className="text-right">Trades</th>
                                    <th className="text-right">Average Profit</th>
                                    <th className="text-right">Total Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topSymbols.slice(0, 5).map((symbol, idx) => (
                                    <tr key={idx}>
                                        <td><strong>{symbol.symbol}</strong></td>
                                        <td className="text-right">{symbol.trade_count}</td>
                                        <td className="text-right" style={{ color: symbol.avg_profit >= 0 ? COLORS.success : COLORS.danger }}>
                                            ₹{symbol.avg_profit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        </td>
                                        <td className="text-right" style={{ color: symbol.total_profit >= 0 ? COLORS.success : COLORS.danger, fontWeight: 'bold' }}>
                                            ₹{symbol.total_profit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default Dashboard;
