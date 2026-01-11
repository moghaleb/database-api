import 'package:flutter/material.dart';
import 'dart:ui' as ui;
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class PaymentPage extends StatefulWidget {
  final double totalAmount;
  final List<Map<String, dynamic>> cartItems;

  const PaymentPage({
    super.key,
    required this.totalAmount,
    required this.cartItems,
  });

  @override
  State<PaymentPage> createState() => _PaymentPageState();
}

class _PaymentPageState extends State<PaymentPage> {
  bool _isLoading = false;
  final String _apiUrl = 'https://redme.cfd';

  // بيانات العميل
  String customerName = 'عميل';
  String customerPhone = '';
  String customerEmail = '';

  // متغيرات الكوبون
  final TextEditingController _couponController = TextEditingController();
  bool _isCheckingCoupon = false;
  Map<String, dynamic>? _appliedCoupon;
  double _discountAmount = 0.0;

  // متغيرات القسيمة الشرائية
  final TextEditingController _giftCardNumberController =
      TextEditingController();
  final TextEditingController _giftCardPinController = TextEditingController();
  bool _isCheckingGiftCard = false;
  Map<String, dynamic>? _appliedGiftCard;
  double _giftCardAmount = 0.0;

  double _finalAmount = 0.0;

  @override
  void initState() {
    super.initState();
    _loadCustomerData();
    _finalAmount = widget.totalAmount;
  }

  // جلب بيانات العميل من SharedPreferences
  Future<void> _loadCustomerData() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      customerName = prefs.getString('user_name') ?? 'عميل';
      customerPhone = prefs.getString('user_phone') ?? '';
      customerEmail = prefs.getString('user_email') ?? '';
    });
  }

  // التحقق من صحة الكوبون
  Future<void> _validateCoupon() async {
    if (_couponController.text.isEmpty) {
      _showMessage('يرجى إدخال كود الكوبون');
      return;
    }

    setState(() {
      _isCheckingCoupon = true;
    });

    try {
      final response = await http.get(
        Uri.parse(
            '$_apiUrl/api/validate-coupon?code=${_couponController.text}&order_amount=${widget.totalAmount}'),
        headers: {'Content-Type': 'application/json'},
      ).timeout(const Duration(seconds: 10));

      print('🔍 استجابة التحقق من الكوبون: ${response.statusCode}');
      print('📦 بيانات الاستجابة: ${response.body}');

      if (response.statusCode == 200) {
        final data = json.decode(response.body);

        if (data['status'] == 'success' && data['valid'] == true) {
          setState(() {
            _appliedCoupon = data['coupon'];
            _discountAmount =
                double.parse(data['coupon']['discount_amount'].toString());
            _finalAmount =
                double.parse(data['calculation']['final_amount'].toString());
          });
          _showMessage(
              '✅ تم تطبيق الكوبون بنجاح! وفرت ${_discountAmount.toStringAsFixed(2)} ر.س');
        } else {
          _showMessage('❌ ${data['message']}');
        }
      } else {
        final data = json.decode(response.body);
        _showMessage('❌ ${data['message']}');
      }
    } catch (e) {
      print('❌ خطأ في التحقق من الكوبون: $e');
      _showMessage('❌ خطأ في الاتصال بالخادم');
    } finally {
      setState(() {
        _isCheckingCoupon = false;
      });
    }
  }

  // إلغاء تطبيق الكوبون
  void _removeCoupon() {
    setState(() {
      _appliedCoupon = null;
      _discountAmount = 0.0;
      _finalAmount = widget.totalAmount - _giftCardAmount;
      _couponController.clear();
    });
    _showMessage('تم إلغاء الكوبون');
  }

  // التحقق من صحة القسيمة الشرائية
  Future<void> _validateGiftCard() async {
    if (_giftCardNumberController.text.isEmpty ||
        _giftCardPinController.text.isEmpty) {
      _showMessage('يرجى إدخال رقم القسيمة والرمز السري');
      return;
    }

    setState(() {
      _isCheckingGiftCard = true;
    });

    try {
      final response = await http
          .post(
            Uri.parse('$_apiUrl/api/validate-gift-card'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({
              'card_number': _giftCardNumberController.text,
              'pin_code': _giftCardPinController.text,
              'order_amount': _finalAmount
            }),
          )
          .timeout(const Duration(seconds: 10));

      print('🔍 استجابة التحقق من القسيمة: ${response.statusCode}');
      print('📦 بيانات الاستجابة: ${response.body}');

      if (response.statusCode == 200) {
        final data = json.decode(response.body);

        if (data['status'] == 'success' && data['valid'] == true) {
          setState(() {
            _appliedGiftCard = data['gift_card'];
            _giftCardAmount =
                double.parse(data['gift_card']['used_amount'].toString());
            _finalAmount =
                double.parse(data['calculation']['final_amount'].toString());
          });
          _showMessage(
              '✅ تم تطبيق القسيمة بنجاح! تم استخدام ${_giftCardAmount.toStringAsFixed(2)} ر.س');
        } else {
          _showMessage('❌ ${data['message']}');
        }
      } else {
        final data = json.decode(response.body);
        _showMessage('❌ ${data['message']}');
      }
    } catch (e) {
      print('❌ خطأ في التحقق من القسيمة: $e');
      _showMessage('❌ خطأ في الاتصال بالخادم');
    } finally {
      setState(() {
        _isCheckingGiftCard = false;
      });
    }
  }

  // إلغاء تطبيق القسيمة الشرائية
  void _removeGiftCard() {
    setState(() {
      _appliedGiftCard = null;
      _giftCardAmount = 0.0;
      _finalAmount = widget.totalAmount - _discountAmount;
      _giftCardNumberController.clear();
      _giftCardPinController.clear();
    });
    _showMessage('تم إلغاء القسيمة');
  }

  // دالة إرسال الطلب إلى الاستضافة
  Future<void> _sendOrderToServer() async {
    if (widget.cartItems.isEmpty) {
      _showMessage('❌ السلة فارغة');
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // تنظيف بيانات المنتجات قبل الإرسال
      final cleanedCartItems = widget.cartItems.map((item) {
        return {
          'id': item['id']?.toString() ?? '0', // إضافة رقم المنتج كـ id
          'product_id': item['id']?.toString() ?? '0', // إضافة رقم المنتج كـ product_id أيضاً
          'name': item['name']?.toString() ?? 'منتج غير معروف',
          'price': _parsePrice(item['price']),
          'quantity': item['quantity'] ?? 1,
          'image': _getFirstImage(item),
          'selectedSize': item['selectedSize']?.toString() ?? 'غير محدد',
          'colors': _getColors(item),
        };
      }).toList();

      // بيانات الطلب الأساسية
      final orderData = {
        'cart_items': cleanedCartItems,
        'total_amount': widget.totalAmount,
        'order_date': DateTime.now().toIso8601String(),
        'order_status': 'pending',
        'customer_name': customerName,
        'customer_phone': customerPhone,
        'customer_email': customerEmail,
        'payment_method': 'online',
        'coupon_code': _appliedCoupon?['code'],
        'gift_card_number': _appliedGiftCard?['card_number'],
        'gift_card_amount': _giftCardAmount,
      };

      print('🚀 إرسال الطلب إلى الخادم...');
      print('📦 بيانات الطلب: ${json.encode(orderData)}');

      final response = await http
          .post(
            Uri.parse('$_apiUrl/api/process-payment'),
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: json.encode(orderData),
          )
          .timeout(const Duration(seconds: 30));

      print('📨 استجابة الخادم: ${response.statusCode}');
      print('📄 محتوى الاستجابة: ${response.body}');

      if (response.statusCode == 200) {
        final data = json.decode(response.body);

        if (data['status'] == 'success') {
          // تحديث البيانات بناءً على الاستجابة من الخادم
          setState(() {
            if (data['discount_amount'] != null) {
              _discountAmount =
                  double.parse(data['discount_amount'].toString());
            }
            if (data['gift_card_amount'] != null) {
              _giftCardAmount =
                  double.parse(data['gift_card_amount'].toString());
            }
            if (data['final_amount'] != null) {
              _finalAmount = double.parse(data['final_amount'].toString());
            }
          });

          // عرض تفاصيل الطلب
          _showOrderSuccessDialog(data);
        } else {
          _showErrorDialog('❌ ${data['message']}');
        }
      } else {
        final errorData = json.decode(response.body);
        _showErrorDialog(
            '❌ خطأ في إرسال الطلب: ${errorData['message'] ?? 'رمز الخطأ: ${response.statusCode}'}');
      }
    } catch (e) {
      print('❌ خطأ في الاتصال: $e');
      _showErrorDialog('❌ خطأ في الاتصال بالخادم: $e');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  // دالة مساعدة للحصول على أول صورة
  String _getFirstImage(Map<String, dynamic> item) {
    if (item['images'] is List && (item['images'] as List).isNotEmpty) {
      return item['images'][0].toString();
    }
    if (item['image'] != null) {
      return item['image'].toString();
    }
    return '';
  }

  // دالة مساعدة للحصول على الألوان
  List<String> _getColors(Map<String, dynamic> item) {
    if (item['colors'] is List) {
      return (item['colors'] as List).map((e) => e.toString()).toList();
    }
    return ['غير محدد'];
  }

  // تحويل السعر إلى رقم
  double _parsePrice(dynamic price) {
    if (price == null) return 0.0;
    if (price is double) return price;
    if (price is int) return price.toDouble();
    if (price is String) {
      final cleaned = price.replaceAll(RegExp(r'[^\d.]'), '');
      return double.tryParse(cleaned) ?? 0.0;
    }
    return 0.0;
  }

  // مسح السلة بعد الإرسال الناجح
  Future<void> _clearCart() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('cart');
      print('✅ تم مسح السلة بنجاح');
    } catch (e) {
      print('❌ خطأ في مسح السلة: $e');
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        duration: const Duration(seconds: 3),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _showOrderSuccessDialog(Map<String, dynamic> orderData) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return Directionality(
          textDirection: ui.TextDirection.rtl,
          child: AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.check_circle, color: Colors.green, size: 30),
                SizedBox(width: 8),
                Text(
                  'تم إرسال الطلب بنجاح',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildInfoRow(
                      'رقم الطلب:', orderData['order_id']?.toString() ?? '---'),
                  _buildInfoRow('المجموع الأصلي:',
                      '${widget.totalAmount.toStringAsFixed(2)} ر.س'),
                  if (_discountAmount > 0)
                    _buildInfoRow('قيمة الخصم:',
                        '${_discountAmount.toStringAsFixed(2)} ر.س'),
                  if (_giftCardAmount > 0)
                    _buildInfoRow('المستخدم من القسيمة:',
                        '${_giftCardAmount.toStringAsFixed(2)} ر.س'),
                  _buildInfoRow('المجموع النهائي:',
                      '${_finalAmount.toStringAsFixed(2)} ر.س'),
                  _buildInfoRow('عدد المنتجات:', '${widget.cartItems.length}'),
                  if (_appliedCoupon != null)
                    _buildInfoRow('الكوبون المستخدم:',
                        _appliedCoupon!['code']?.toString() ?? ''),
                  if (_appliedGiftCard != null)
                    _buildInfoRow('القسيمة المستخدمة:',
                        _appliedGiftCard!['card_number']?.toString() ?? ''),
                  _buildInfoRow('اسم العميل:', customerName),
                  _buildInfoRow('حالة الطلب:', 'قيد المراجعة'),

                  // عرض أرقام المنتجات
                  const SizedBox(height: 8),
                  const Text(
                    'أرقام المنتجات:',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.grey[100],
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: widget.cartItems.map((item) {
                        final productId = item['id']?.toString() ?? 'غير معروف';
                        final productName = item['name']?.toString() ?? 'منتج غير معروف';
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  productName,
                                  style: const TextStyle(fontSize: 12),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                productId,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.blue,
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.green[50],
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.green),
                    ),
                    child: const Text(
                      '✅ تم إرسال طلبك إلى الإدارة وسيتم التواصل معك قريباً',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.green,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              ElevatedButton(
                onPressed: () async {
                  await _clearCart();
                  Navigator.of(context).popUntil((route) => route.isFirst);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                ),
                child: const Text('العودة للرئيسية'),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          Text(value),
        ],
      ),
    );
  }

  void _showErrorDialog(String message) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return Directionality(
          textDirection: ui.TextDirection.rtl,
          child: AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.error_outline, color: Colors.red, size: 30),
                SizedBox(width: 8),
                Text('خطأ في المعالجة'),
              ],
            ),
            content: Text(message),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('حاول مرة أخرى'),
              ),
            ],
          ),
        );
      },
    );
  }

  String _formatPrice(double price) {
    return "${price.toStringAsFixed(2)} ر.س";
  }

  Widget _buildCouponSection() {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.discount, color: Colors.orange),
                SizedBox(width: 8),
                Text(
                  'كود الخصم',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _couponController,
                    decoration: InputDecoration(
                      hintText: 'أدخل كود الخصم هنا...',
                      border: const OutlineInputBorder(),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 12),
                      suffixIcon: _appliedCoupon != null
                          ? IconButton(
                              icon: const Icon(Icons.clear, color: Colors.red),
                              onPressed: _removeCoupon,
                            )
                          : null,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                _appliedCoupon == null
                    ? ElevatedButton(
                        onPressed: _isCheckingCoupon ? null : _validateCoupon,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.orange,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 20, vertical: 12),
                        ),
                        child: _isCheckingCoupon
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                      Colors.white),
                                ),
                              )
                            : const Text('تطبيق'),
                      )
                    : ElevatedButton(
                        onPressed: _removeCoupon,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 20, vertical: 12),
                        ),
                        child: const Text('إلغاء'),
                      ),
              ],
            ),
            if (_appliedCoupon != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.discount, color: Colors.green),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'كود ${_appliedCoupon!['code']} مطبق',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.green,
                            ),
                          ),
                          Text(
                            'وفرت ${_discountAmount.toStringAsFixed(2)} ر.س',
                            style: const TextStyle(
                              color: Colors.green,
                            ),
                          ),
                          if (_appliedCoupon!['description'] != null)
                            Text(
                              _appliedCoupon!['description'].toString(),
                              style: const TextStyle(
                                fontSize: 12,
                                color: Colors.grey,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildGiftCardSection() {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.card_giftcard, color: Colors.purple),
                SizedBox(width: 8),
                Text(
                  'القسيمة الشرائية',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_appliedGiftCard == null) ...[
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _giftCardNumberController,
                      decoration: const InputDecoration(
                        hintText: 'رقم القسيمة',
                        border: OutlineInputBorder(),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _giftCardPinController,
                      decoration: const InputDecoration(
                        hintText: 'الرمز السري',
                        border: OutlineInputBorder(),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      ),
                      obscureText: true,
                      keyboardType: TextInputType.number,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isCheckingGiftCard ? null : _validateGiftCard,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.purple,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: _isCheckingGiftCard
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor:
                                AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : const Text('تفعيل القسيمة'),
                ),
              ),
            ] else ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.purple[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.purple),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.card_giftcard, color: Colors.purple),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'قسيمة ${_appliedGiftCard!['card_number']}',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.purple,
                            ),
                          ),
                          Text(
                            'المستخدم: ${_giftCardAmount.toStringAsFixed(2)} ر.س',
                            style: const TextStyle(
                              color: Colors.purple,
                            ),
                          ),
                          if (_appliedGiftCard!['balance'] != null)
                            Text(
                              'الرصيد المتبقي: ${_appliedGiftCard!['balance'].toStringAsFixed(2)} ر.س',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Colors.grey,
                              ),
                            ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.clear, color: Colors.red),
                      onPressed: _removeGiftCard,
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildOrderSummary() {
    return Card(
      margin: const EdgeInsets.all(16),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.shopping_cart_checkout, color: Colors.blue),
                SizedBox(width: 8),
                Text(
                  'ملخص الطلب',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            ...widget.cartItems.map((item) {
              final price = _parsePrice(item['price']);
              final quantity = item['quantity'] ?? 1;
              final productName = item['name'] ?? 'منتج';
              final total = price * quantity;

              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey[300]!),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    if (_getFirstImage(item).isNotEmpty)
                      Container(
                        width: 50,
                        height: 50,
                        margin: const EdgeInsets.only(left: 8),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          image: DecorationImage(
                            image: NetworkImage(_getFirstImage(item)),
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            productName,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${_formatPrice(price)} × $quantity',
                            style: const TextStyle(
                              color: Colors.grey,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      _formatPrice(total),
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.blue,
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),

            const Divider(height: 24),

            // تفاصيل الأسعار
            _buildPriceRow('المجموع الفرعي:', widget.totalAmount),

            if (_discountAmount > 0)
              _buildPriceRow(
                'الخصم ${_appliedCoupon?['code'] ?? ''}:',
                -_discountAmount,
                isDiscount: true,
              ),

            if (_giftCardAmount > 0)
              _buildPriceRow(
                'القسيمة الشرائية:',
                -_giftCardAmount,
                isDiscount: true,
              ),

            const Divider(height: 16),
            _buildPriceRow(
              'المجموع النهائي:',
              _finalAmount,
              isTotal: true,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPriceRow(String label, double amount,
      {bool isDiscount = false, bool isTotal = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontWeight: isTotal ? FontWeight.bold : FontWeight.normal,
              fontSize: isTotal ? 16 : 14,
              color: isDiscount ? Colors.green : null,
            ),
          ),
          Text(
            isDiscount ? '-${_formatPrice(amount)}' : _formatPrice(amount),
            style: TextStyle(
              fontWeight: isTotal ? FontWeight.bold : FontWeight.normal,
              fontSize: isTotal ? 18 : 14,
              color:
                  isTotal ? Colors.green : (isDiscount ? Colors.green : null),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: ui.TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('إتمام الطلب'),
          centerTitle: true,
          backgroundColor: Colors.blue,
          foregroundColor: Colors.white,
        ),
        body: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    _buildOrderSummary(),
                    _buildCouponSection(),
                    _buildGiftCardSection(),

                    // معلومات العميل
                    Card(
                      margin: const EdgeInsets.all(16),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.person, color: Colors.purple),
                                SizedBox(width: 8),
                                Text(
                                  'معلومات العميل',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            _buildInfoRow('الاسم:', customerName),
                            if (customerPhone.isNotEmpty)
                              _buildInfoRow('الهاتف:', customerPhone),
                            if (customerEmail.isNotEmpty)
                              _buildInfoRow('البريد:', customerEmail),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // زر الإرسال
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Colors.grey.withOpacity(0.3),
                    spreadRadius: 1,
                    blurRadius: 5,
                    offset: const Offset(0, -3),
                  ),
                ],
              ),
              child: Column(
                children: [
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _isLoading ? null : _sendOrderToServer,
                      icon: _isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor:
                                    AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : const Icon(Icons.send, size: 24),
                      label: Text(
                        _isLoading
                            ? 'جاري إرسال الطلب...'
                            : 'إرسال الطلب إلى الإدارة',
                        style: const TextStyle(fontSize: 16),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1193d4),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 2,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'سيتم التواصل معك لتأكيد الطلب',
                    style: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _couponController.dispose();
    _giftCardNumberController.dispose();
    _giftCardPinController.dispose();
    super.dispose();
  }
}
