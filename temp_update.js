// جزء محدث من كود معالجة الطلبات
      db.run(
        `INSERT INTO orders (
          order_number, cart_items, total_amount, discount_amount, coupon_code,
          coupon_type, gift_card_number, gift_card_amount, gift_card_type, order_date, order_status,
          customer_name, customer_phone, customer_email, payment_method
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNumber,
          JSON.stringify(cart_items),
          total_amount, // المبلغ الأصلي
          discountAmount, // قيمة الخصم
          appliedCoupon ? appliedCoupon.code : null,
          appliedCoupon ? appliedCoupon.discount_type : null,
          appliedGiftCard ? appliedGiftCard.card_number : null,
          giftCardAmount, // المبلغ المستخدم من القسيمة
          appliedGiftCard ? 'gift_card' : null,
          order_date,
          order_status || 'pending',
          customer_name || 'عميل',
          customer_phone || '',
          customer_email || '',
          payment_method || 'online'
        ],