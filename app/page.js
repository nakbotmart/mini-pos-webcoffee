'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const emptyForm = { sku: '', name: '', price: '', stock: '', unit: '' };

const formatMoney = (n) =>
  Number(n).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const sortProducts = (list) =>
  [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // โหลดข้อมูลครั้งแรก
  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      setMessage({ type: 'error', text: 'โหลดข้อมูลสินค้าไม่สำเร็จ: ' + error.message });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchProducts();

    // Real-time: อัปเดตตารางอัตโนมัติเมื่อข้อมูลใน products เปลี่ยน
    // (ต้องเปิด Realtime ให้ตาราง products ใน Supabase > Database > Replication)
    const channel = supabase
      .channel('products-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setProducts((prev) =>
              prev.some((p) => p.id === payload.new.id)
                ? prev
                : sortProducts([...prev, payload.new])
            );
          } else if (payload.eventType === 'UPDATE') {
            setProducts((prev) =>
              prev.map((p) => (p.id === payload.new.id ? payload.new : p))
            );
          } else if (payload.eventType === 'DELETE') {
            setProducts((prev) => prev.filter((p) => p.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);

    const sku = form.sku.trim();
    const name = form.name.trim();
    const unit = form.unit.trim();
    const price = Number(form.price);
    const stock = parseInt(form.stock, 10);

    if (!sku) {
      setMessage({ type: 'error', text: 'กรุณากรอก SKU' });
      return;
    }
    if (!name) {
      setMessage({ type: 'error', text: 'กรุณากรอกชื่อสินค้า' });
      return;
    }
    if (form.price === '' || Number.isNaN(price) || price < 0) {
      setMessage({ type: 'error', text: 'กรุณากรอกราคาให้ถูกต้อง' });
      return;
    }
    if (form.stock === '' || Number.isNaN(stock) || stock < 0) {
      setMessage({ type: 'error', text: 'กรุณากรอกจำนวนสต๊อกให้ถูกต้อง' });
      return;
    }
    if (!unit) {
      setMessage({ type: 'error', text: 'กรุณากรอกหน่วยนับ เช่น ชิ้น, แก้ว, ขวด' });
      return;
    }

    setSaving(true);
    const payload = { sku, name, price, stock, unit };

    if (editingId) {
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single();

      if (error) {
        setMessage({ type: 'error', text: 'แก้ไขไม่สำเร็จ: ' + error.message });
      } else {
        setProducts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
        setMessage({ type: 'success', text: 'แก้ไขสินค้าเรียบร้อยแล้ว' });
        resetForm();
      }
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert([payload])
        .select()
        .single();

      if (error) {
        setMessage({ type: 'error', text: 'เพิ่มสินค้าไม่สำเร็จ: ' + error.message });
      } else {
        setProducts((prev) =>
          prev.some((p) => p.id === data.id) ? prev : sortProducts([...prev, data])
        );
        setMessage({ type: 'success', text: 'เพิ่มสินค้าเรียบร้อยแล้ว' });
        resetForm();
      }
    }

    setSaving(false);
  }

  function handleEdit(product) {
    setEditingId(product.id);
    setForm({
      sku: product.sku ?? '',
      name: product.name ?? '',
      price: String(product.price ?? ''),
      stock: String(product.stock ?? ''),
      unit: product.unit ?? '',
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(product) {
    const ok = window.confirm(`ต้องการลบสินค้า "${product.name}" ใช่หรือไม่?`);
    if (!ok) return;

    setMessage(null);
    const { error } = await supabase.from('products').delete().eq('id', product.id);

    if (error) {
      setMessage({ type: 'error', text: 'ลบไม่สำเร็จ: ' + error.message });
    } else {
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      if (editingId === product.id) resetForm();
      setMessage({ type: 'success', text: 'ลบสินค้าเรียบร้อยแล้ว' });
    }
  }

  return (
    <div>
      <h1>สินค้า</h1>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="card">
        <h2>{editingId ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="sku">SKU</label>
              <input
                id="sku"
                name="sku"
                type="text"
                value={form.sku}
                onChange={handleChange}
                placeholder="เช่น P-001"
              />
            </div>
            <div className="field" style={{ flex: '2 1 200px' }}>
              <label htmlFor="name">ชื่อสินค้า</label>
              <input
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                placeholder="เช่น กาแฟเย็น"
              />
            </div>
            <div className="field">
              <label htmlFor="price">ราคา (บาท)</label>
              <input
                id="price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={handleChange}
                placeholder="0.00"
              />
            </div>
            <div className="field">
              <label htmlFor="stock">สต๊อก</label>
              <input
                id="stock"
                name="stock"
                type="number"
                min="0"
                step="1"
                value={form.stock}
                onChange={handleChange}
                placeholder="0"
              />
            </div>
            <div className="field">
              <label htmlFor="unit">หน่วย</label>
              <input
                id="unit"
                name="unit"
                type="text"
                value={form.unit}
                onChange={handleChange}
                placeholder="เช่น ชิ้น"
              />
            </div>
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                ยกเลิก
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>รายการสินค้า ({products.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>ชื่อสินค้า</th>
                <th className="num">ราคา (บาท)</th>
                <th className="num">คงเหลือ</th>
                <th>หน่วย</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="empty">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    ยังไม่มีสินค้า เพิ่มสินค้าแรกได้จากฟอร์มด้านบน
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id}>
                    <td>{p.sku}</td>
                    <td>{p.name}</td>
                    <td className="num">{formatMoney(p.price)}</td>
                    <td className={`num ${p.stock <= 5 ? 'low-stock' : ''}`}>{p.stock}</td>
                    <td>{p.unit}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEdit(p)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(p)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
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
