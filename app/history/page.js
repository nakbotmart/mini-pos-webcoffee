'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const formatMoney = (n) =>
  Number(n).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '-';

export default function HistoryPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  async function fetchSales() {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('sold_at', { ascending: false });

    if (error) {
      setMessage({ type: 'error', text: 'โหลดประวัติการขายไม่สำเร็จ: ' + error.message });
    } else {
      setMessage(null);
      setSales(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchSales();
  }, []);

  // ยอดขายรวมทั้งหมด
  const totalRevenue = useMemo(
    () => sales.reduce((sum, s) => sum + Number(s.total_price || 0), 0),
    [sales]
  );

  return (
    <div>
      <h1>ประวัติการขาย</h1>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="card">
        <div className="stat">
          <div className="label">ยอดขายรวมทั้งหมด (Total Revenue)</div>
          <div className="value" style={{ fontSize: 44 }}>
            {formatMoney(totalRevenue)} บาท
          </div>
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <h2 style={{ margin: 0 }}>รายการขายล่าสุด ({sales.length})</h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={fetchSales}
            disabled={loading}
          >
            {loading ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>วัน-เวลาที่ขาย</th>
                <th>ชื่อสินค้า</th>
                <th className="num">จำนวน</th>
                <th className="num">ยอดรวม (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {loading && sales.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    ยังไม่มีประวัติการขาย
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDateTime(s.sold_at)}</td>
                    <td>{s.product_name}</td>
                    <td className="num">{s.quantity}</td>
                    <td className="num">{formatMoney(s.total_price)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
