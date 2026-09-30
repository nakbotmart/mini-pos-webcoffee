'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const formatMoney = (n) =>
  Number(n).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  async function fetchProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setMessage({ type: 'error', text: 'โหลดข้อมูลสินค้าไม่สำเร็จ: ' + error.message });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  const totalItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  // เพิ่มสินค้าเข้าตะกร้า (ถ้ามีสินค้านี้อยู่แล้วจะรวมจำนวนให้)
  function handleAddToCart() {
    setMessage(null);

    const product = products.find((p) => p.id === selectedId);
    const qty = parseInt(quantity, 10);

    if (!product) {
      setMessage({ type: 'error', text: 'กรุณาเลือกสินค้า' });
      return;
    }
    if (Number.isNaN(qty) || qty <= 0) {
      setMessage({ type: 'error', text: 'กรุณากรอกจำนวนให้ถูกต้อง (อย่างน้อย 1)' });
      return;
    }

    const existing = cart.find((item) => item.product_id === product.id);
    const newQty = (existing ? existing.quantity : 0) + qty;

    if (newQty > product.stock) {
      window.alert(
        `สต๊อกไม่พอ: "${product.name}" คงเหลือ ${product.stock} ${product.unit || ''}`.trim()
      );
      return;
    }

    if (existing) {
      setCart((prev) =>
        prev.map((item) =>
          item.product_id === product.id ? { ...item, quantity: newQty } : item
        )
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          product_id: product.id,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          price: Number(product.price),
          quantity: qty,
        },
      ]);
    }

    setSelectedId('');
    setQuantity('1');
  }

  function handleRemove(productId) {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  }

  function handleClearCart() {
    setCart([]);
    setMessage(null);
  }

  // คืนสต๊อกกรณีขั้นตอนใดขั้นตอนหนึ่งล้มเหลว
  async function rollbackStock(deducted) {
    for (const d of deducted) {
      await supabase.from('products').update({ stock: d.oldStock }).eq('id', d.id);
    }
  }

  async function handleCheckout() {
    setMessage(null);

    if (cart.length === 0) {
      setMessage({ type: 'error', text: 'ตะกร้าว่างเปล่า' });
      return;
    }

    setSubmitting(true);

    // 1) ดึงสต๊อกล่าสุดจากฐานข้อมูลก่อนขาย
    const ids = cart.map((item) => item.product_id);
    const { data: latest, error: fetchError } = await supabase
      .from('products')
      .select('id, name, stock')
      .in('id', ids);

    if (fetchError) {
      setMessage({ type: 'error', text: 'ตรวจสอบสต๊อกไม่สำเร็จ: ' + fetchError.message });
      setSubmitting(false);
      return;
    }

    // 2) ตรวจสอบว่าสต๊อกเพียงพอหรือไม่
    for (const item of cart) {
      const current = (latest || []).find((p) => p.id === item.product_id);
      if (!current) {
        window.alert(`ไม่พบสินค้า "${item.name}" ในระบบ`);
        setSubmitting(false);
        await fetchProducts();
        return;
      }
      if (current.stock < item.quantity) {
        window.alert(
          `สต๊อกไม่พอ: "${item.name}" คงเหลือ ${current.stock} แต่ต้องการ ${item.quantity}`
        );
        setSubmitting(false);
        await fetchProducts();
        return;
      }
    }

    // 3) ตัดสต๊อก (มีเงื่อนไขว่าสต๊อกต้องยังเท่าเดิม กันขายซ้อนกัน)
    const deducted = [];
    for (const item of cart) {
      const current = latest.find((p) => p.id === item.product_id);
      const { data: updated, error: updateError } = await supabase
        .from('products')
        .update({ stock: current.stock - item.quantity })
        .eq('id', item.product_id)
        .eq('stock', current.stock)
        .select('id');

      if (updateError || !updated || updated.length === 0) {
        await rollbackStock(deducted);
        setMessage({
          type: 'error',
          text: updateError
            ? `ตัดสต๊อกไม่สำเร็จ: ${updateError.message}`
            : `สต๊อกของ "${item.name}" ถูกเปลี่ยนโดยรายการอื่น กรุณาลองใหม่อีกครั้ง`,
        });
        setSubmitting(false);
        await fetchProducts();
        return;
      }
      deducted.push({ id: item.product_id, oldStock: current.stock });
    }

    // 4) บันทึกรายการขายลงตาราง sales
    const soldAt = new Date().toISOString();
    const saleRows = cart.map((item) => ({
      product_id: item.product_id,
      product_name: item.name,
      quantity: item.quantity,
      total_price: item.price * item.quantity,
      sold_at: soldAt,
    }));

    const { error: saleError } = await supabase.from('sales').insert(saleRows);

    if (saleError) {
      await rollbackStock(deducted);
      setMessage({
        type: 'error',
        text: 'บันทึกการขายไม่สำเร็จ (คืนสต๊อกแล้ว): ' + saleError.message,
      });
      setSubmitting(false);
      await fetchProducts();
      return;
    }

    // 5) สำเร็จ: ล้างตะกร้า + แสดงข้อความ
    setMessage({
      type: 'success',
      text: `ขายสำเร็จ ${cart.length} รายการ ยอดรวม ${formatMoney(total)} บาท`,
    });
    setCart([]);
    await fetchProducts();
    setSubmitting(false);
  }

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="card">
        <div className="stat">
          <div className="label">
            ราคารวมทั้งหมด ({cart.length} รายการ / {totalItems} ชิ้น)
          </div>
          <div className="value" style={{ fontSize: 44 }}>
            {formatMoney(total)} บาท
          </div>
        </div>
      </div>

      <div className="card">
        <h2>เพิ่มสินค้าลงตะกร้า</h2>
        <div className="form-row">
          <div className="field" style={{ flex: '2 1 240px' }}>
            <label htmlFor="product">สินค้า</label>
            <select
              id="product"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loading}
            >
              <option value="">{loading ? 'กำลังโหลด...' : '-- เลือกสินค้า --'}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id} disabled={p.stock <= 0}>
                  {p.sku ? `[${p.sku}] ` : ''}
                  {p.name} — {formatMoney(p.price)} บาท (เหลือ {p.stock} {p.unit || ''})
                  {p.stock <= 0 ? ' - หมด' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="quantity">จำนวน</label>
            <input
              id="quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={handleAddToCart}>
              เพิ่มเข้าตะกร้า
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>ตะกร้าสินค้า</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>สินค้า</th>
                <th className="num">ราคา/หน่วย</th>
                <th className="num">จำนวน</th>
                <th className="num">รวม (บาท)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    ยังไม่มีสินค้าในตะกร้า
                  </td>
                </tr>
              ) : (
                cart.map((item) => (
                  <tr key={item.product_id}>
                    <td>{item.sku}</td>
                    <td>{item.name}</td>
                    <td className="num">{formatMoney(item.price)}</td>
                    <td className="num">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="num">{formatMoney(item.price * item.quantity)}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRemove(item.product_id)}
                        disabled={submitting}
                      >
                        เอาออก
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="total-row">
          <div>
            รวมสุทธิ: <span className="total-amount">{formatMoney(total)} บาท</span>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClearCart}
              disabled={submitting || cart.length === 0}
            >
              ล้างตะกร้า
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleCheckout}
              disabled={submitting || cart.length === 0}
            >
              {submitting ? 'กำลังบันทึก...' : 'ยืนยันการขาย'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
