
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { OrderStatus } from "@prisma/client";
import { emitNewOrder } from "../socket";

const generateOrderNumber = (): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `ORD-${timestamp}-${random}`;
};

const formatAddress = (address: any, phoneNumber: string): string => {
    if (typeof address === 'string') {
        return address;
    }

    if (typeof address === 'object' && address !== null) {
        const parts = [
            address.street,
            address.city,
            address.state,
            address.zip_code,
            address.country
        ].filter(Boolean);

        const addressString = parts.join(', ');
        return JSON.stringify({
            formatted: addressString,
            street: address.street || '',
            city: address.city || '',
            state: address.state || '',
            zip_code: address.zip_code || '',
            country: address.country || '',
            phone: phoneNumber
        });
    }

    return JSON.stringify({
        raw: String(address),
        phone: phoneNumber
    });
};

const parseAddress = (addressString: string): any => {
    try {
        const parsed = JSON.parse(addressString);
        return parsed;
    } catch {
        return addressString;
    }
};

export const getMyOrders = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const userId = user?.id;
        const userRole = user?.role;

        const { page = "1", limit = "10", status } = req.query;

        const pageNum = Math.max(1, Number(page));
        const take = Math.min(50, Math.max(1, Number(limit)));
        const skip = (pageNum - 1) * take;

        const where: any = {};
        
        // Only filter by user_id if not admin
        if (userRole !== 'ADMIN') {
            where.user_id = userId;
        }

        if (status && Object.values(OrderStatus).includes(status as OrderStatus)) {
            where.status = status;
        }

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                take,
                skip,
                orderBy: { created_at: "desc" },
                select: {
                    id: true,
                    order_number: true,
                    total_amount: true,
                    status: true,
                    payment_status: true,
                    payment_method: true,
                    created_at: true,
                    cancelled_at: true,
                    orderItems: {
                        select: {
                            id: true,
                            quantity: true,
                            unit_price: true,
                            subtotal: true,
                            product: {
                                select: {
                                    id: true,
                                    name: true,
                                    img: true,
                                }
                            }
                        }
                    }
                }
            }),
            prisma.order.count({ where })
        ]);

        const ordersWithParsedAddresses = orders.map(order => ({
            ...order,

        }));

        return res.json({
            success: true,
            data: ordersWithParsedAddresses,
            pagination: {
                page: pageNum,
                limit: take,
                total,
                totalPages: Math.ceil(total / take),
            }
        });
    } catch (error) {
        console.error("[getMyOrders] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch your orders"
        });
    }
};

export const getMyOrderById = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const userId = user?.id;
        const userRole = user?.role;

        const orderId = Number(req.params.id);

        if (!orderId || isNaN(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID"
            });
        }

        const where: any = { id: orderId };
        if (userRole !== 'ADMIN') {
            where.user_id = userId;
        }

        const order = await prisma.order.findFirst({
            where,
            include: {
                orderItems: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                img: true,
                                sku: true,
                                price: true,
                                description: true,
                            }
                        }
                    }
                },
                user: {
                    select: {
                        email: true,
                        username: true,
                        profile: {
                            select: {
                                first_name: true,
                                last_name: true,
                                phone: true,
                            }
                        }
                    }
                }
            }
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        const shippingAddress = parseAddress(order.shipping_address);
        const billingAddress = parseAddress(order.billing_address);

        return res.json({
            success: true,
            data: {
                ...order,
                shipping_address: shippingAddress,
                billing_address: billingAddress
            }
        });
    } catch (error) {
        console.error("[getMyOrderById] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch order details"
        });
    }
};

export const createOrder = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const {
            items,
            shippingAddress,
            billingAddress,
            notes,
            phoneNumber
        } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Order items are required"
            });
        }

        if (!shippingAddress || !phoneNumber) {
            return res.status(400).json({
                success: false,
                message: "Shipping address and phone number are required"
            });
        }

        if (typeof phoneNumber !== 'string' || phoneNumber.trim().length < 8) {
            return res.status(400).json({
                success: false,
                message: "Valid phone number is required"
            });
        }

        for (const item of items) {
            if (!item.productId || !item.quantity || item.quantity < 1) {
                return res.status(400).json({
                    success: false,
                    message: "Each item must have productId and quantity (min 1)"
                });
            }
        }

        const order = await prisma.$transaction(async (tx) => {

            let totalAmount = 0;
            const orderItems = [];

            for (const item of items) {
                const product = await tx.product.findUnique({
                    where: { id: item.productId },
                    select: {
                        id: true,
                        price: true,
                        stock: true,
                        name: true,
                        is_available: true,
                    }
                });

                if (!product) {
                    throw new Error(`Product ${item.productId} not found`);
                }

                if (!product.is_available) {
                    throw new Error(`Product "${product.name}" is currently unavailable`);
                }

                if (product.stock < item.quantity) {
                    throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock}`);
                }

                const subtotal = product.price * item.quantity;
                totalAmount += subtotal;

                orderItems.push({
                    product_id: product.id,
                    quantity: item.quantity,
                    unit_price: product.price,
                    subtotal,
                });

                await tx.product.update({
                    where: { id: product.id },
                    data: {
                        stock: product.stock - item.quantity,
                        updated_at: new Date()
                    }
                });
            }

            const shippingAddressString = formatAddress(shippingAddress, phoneNumber);
            const billingAddressString = billingAddress
                ? formatAddress(billingAddress, phoneNumber)
                : shippingAddressString;

            const orderNumber = generateOrderNumber();

            const newOrder = await tx.order.create({
                data: {
                    user_id: userId,
                    order_number: orderNumber,
                    total_amount: totalAmount,
                    shipping_address: shippingAddressString,
                    billing_address: billingAddressString,
                    payment_method: "COD",
                    payment_status: "pending",
                    status: "PENDING",
                    notes: notes || null,
                    orderItems: {
                        create: orderItems
                    }
                },
                include: {
                    orderItems: {
                        include: {
                            product: {
                                select: {
                                    id: true,
                                    name: true,
                                    img: true,
                                    price: true
                                }
                            }
                        }
                    },
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true
                        }
                    }
                }
            });

            return newOrder;
        });

        // Emit socket event for real-time admin updates
        emitNewOrder({
            id: order.id,
            user_id: order.user_id,
            order_number: order.order_number,
            total_amount: order.total_amount,
            status: order.status,
            payment_status: order.payment_status,
            payment_method: order.payment_method,
            created_at: order.created_at,
            user: order.user,
            orderItems: order.orderItems,
        });

        return res.status(201).json({
            success: true,
            message: "Order placed successfully. Pay on delivery.",
            data: {
                orderId: order.id,
                orderNumber: order.order_number,
                totalAmount: order.total_amount,
                paymentMethod: "Cash on Delivery",
                status: order.status,
                estimatedDelivery: "3-5 business days",
                items: order.orderItems.map(item => ({
                    product: item.product,
                    quantity: item.quantity,
                    unitPrice: item.unit_price,
                    subtotal: item.subtotal
                }))
            }
        });

    } catch (error: any) {
        console.error("[createOrder] Error:", error);

        if (error.message.includes("not found") ||
            error.message.includes("stock") ||
            error.message.includes("unavailable")) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to place order. Please try again."
        });
    }
};

export const cancelMyOrder = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const orderId = Number(req.params.id);

        if (!orderId || isNaN(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID"
            });
        }

        const order = await prisma.order.findFirst({
            where: {
                id: orderId,
                user_id: userId,
                status: { in: ["PENDING", "PROCESSING"] }
            },
            include: {
                orderItems: {
                    include: {
                        product: true
                    }
                }
            }
        });

        if (!order) {
            return res.status(400).json({
                success: false,
                message: "Order cannot be cancelled (already shipped, delivered, or not found)"
            });
        }

        await prisma.$transaction(async (tx) => {

            for (const item of order.orderItems) {
                await tx.product.update({
                    where: { id: item.product_id },
                    data: {
                        stock: item.product.stock + item.quantity,
                        updated_at: new Date()
                    }
                });
            }

            await tx.order.update({
                where: { id: orderId },
                data: {
                    status: "CANCELLED",
                    cancelled_at: new Date(),
                    updated_at: new Date()
                }
            });
        });

        return res.json({
            success: true,
            message: "Order cancelled successfully. Items have been restocked."
        });

    } catch (error) {
        console.error("[cancelMyOrder] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to cancel order"
        });
    }
};

export const confirmDelivery = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const orderId = Number(req.params.id);
        const { paymentReceived = true } = req.body;

        if (!orderId || isNaN(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID"
            });
        }

        const order = await prisma.order.findFirst({
            where: {
                id: orderId,
                user_id: userId,
                status: "SHIPPED",
                payment_method: "COD"
            }
        });

        if (!order) {
            return res.status(400).json({
                success: false,
                message: "Order not found or cannot be confirmed for delivery"
            });
        }

        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: "DELIVERED",
                payment_status: paymentReceived ? "paid" : "pending",
                updated_at: new Date()
            }
        });

        return res.json({
            success: true,
            message: paymentReceived
                ? "Delivery confirmed. Payment marked as received."
                : "Delivery confirmed. Payment pending."
        });

    } catch (error) {
        console.error("[confirmDelivery] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to confirm delivery"
        });
    }
};

export const getAvailableProducts = async (req: Request, res: Response) => {
    try {
        const { page = "1", limit = "20", category, search, minPrice, maxPrice } = req.query;

        const pageNum = Math.max(1, Number(page));
        const take = Math.min(100, Math.max(1, Number(limit)));
        const skip = (pageNum - 1) * take;

        const where: any = {
            stock: { gt: 0 }
        };

        if (category && typeof category === "string") {
            where.category = {
                name: category
            };
        }

        if (search && typeof search === "string") {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { category: { name: { contains: search, mode: "insensitive" } } }
            ];
        }

        if (minPrice && !isNaN(Number(minPrice))) {
            where.price = { gte: Number(minPrice) };
        }

        if (maxPrice && !isNaN(Number(maxPrice))) {
            where.price = { ...where.price, lte: Number(maxPrice) };
        }

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                take,
                skip,
                orderBy: { created_at: "desc" },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            }),
            prisma.product.count({ where })
        ]);

        const formattedProducts = products.map(product => ({
            id: product.id,
            name: product.name,
            description: product.description,
            price: product.price,
            oldPrice: product.old_price,
            img: product.img,
            sku: product.sku,
            stock: product.stock,
            category: product.category,
            createdAt: product.created_at
        }));

        return res.json({
            success: true,
            data: formattedProducts,
            pagination: {
                page: pageNum,
                limit: take,
                total,
                totalPages: Math.ceil(total / take),
            }
        });

    } catch (error) {
        console.error("[getAvailableProducts] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch products"
        });
    }
};

export const getProductById = async (req: Request, res: Response) => {
    try {
        const productId = Number(req.params.id);

        if (!productId || isNaN(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID"
            });
        }

        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        if (product.stock <= 0) {
            return res.status(400).json({
                success: false,
                message: "Product is out of stock",
                data: {
                    ...product,
                    available: false
                }
            });
        }

        return res.json({
            success: true,
            data: {
                ...product,
                available: product.stock > 0
            }
        });

    } catch (error) {
        console.error("[getProductById] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch product details"
        });
    }
};

export const getOrderSummary = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;

        const [summary, totalSpent, recentOrders] = await Promise.all([

            prisma.order.groupBy({
                by: ['status'],
                where: { user_id: userId },
                _count: { id: true },
                _sum: { total_amount: true }
            }),

            prisma.order.aggregate({
                where: {
                    user_id: userId,
                    status: "DELIVERED"
                },
                _sum: { total_amount: true }
            }),

            prisma.order.findMany({
                where: { user_id: userId },
                take: 5,
                orderBy: { created_at: "desc" },
                select: {
                    id: true,
                    order_number: true,
                    total_amount: true,
                    status: true,
                    created_at: true
                }
            })
        ]);

        return res.json({
            success: true,
            data: {
                byStatus: summary,
                totalOrders: summary.reduce((sum, item) => sum + item._count.id, 0),
                totalSpent: totalSpent._sum.total_amount || 0,
                recentOrders,
                codOrders: summary.find(item => item.status === "DELIVERED")?._count.id || 0
            }
        });

    } catch (error) {
        console.error("[getOrderSummary] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch order summary"
        });
    }
};

export const getUserProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                username: true,
                role: true,
                created_at: true,
                profile: true,
                _count: {
                    select: {
                        orders: true,
                        cart: true,
                        wishlist: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.json({
            success: true,
            data: user
        });

    } catch (error) {
        console.error("[getUserProfile] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch user profile"
        });
    }
};

export const postUserProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const {
            first_name,
            last_name,
            img,
            phone,
            address,
            city,
            state,
            zip_code,
            country,
            username
        } = req.body;

        const profileData: any = {};
        if (first_name !== undefined) profileData.first_name = first_name;
        if (last_name !== undefined) profileData.last_name = last_name;
        if (img !== undefined) profileData.img = img;
        if (phone !== undefined) profileData.phone = phone;
        if (address !== undefined) profileData.address = address;
        if (city !== undefined) profileData.city = city;
        if (state !== undefined) profileData.state = state;
        if (zip_code !== undefined) profileData.zip_code = zip_code;
        if (country !== undefined) profileData.country = country;

        const updateData: any = {};
        if (username !== undefined) updateData.username = username;

        if (Object.keys(profileData).length > 0) {
            updateData.profile = {
                upsert: {
                    create: profileData,
                    update: profileData
                }
            };
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                username: true,
                role: true,
                created_at: true,
                profile: true,
                _count: {
                    select: {
                        orders: true,
                        cart: true,
                        wishlist: true
                    }
                }
            }
        });

        return res.json({
            success: true,
            data: updatedUser,
            message: "Profile updated successfully"
        });

    } catch (error) {
        console.error("[postUserProfile] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update user profile"
        });
    }
};

export const getMyCart = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;

        const cartItems = await prisma.cart.findMany({
            where: { user_id: userId },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        img: true,
                        price: true,
                        stock: true,
                    }
                }
            }
        });

        const total = cartItems.reduce((sum, item) =>
            sum + (item.quantity * item.product.price), 0
        );

        const itemsWithAvailability = cartItems.map(item => ({
            ...item,
            available: item.product.stock >= item.quantity,
            maxQuantity: item.product.stock
        }));

        return res.json({
            success: true,
            data: {
                items: itemsWithAvailability,
                total,
                itemCount: cartItems.length,
                allAvailable: itemsWithAvailability.every(item => item.available)
            }
        });

    } catch (error) {
        console.error("[getMyCart] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch cart"
        });
    }
};

export const addToCart = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { productId, quantity = 1 } = req.body;

        if (!productId || quantity < 1) {
            return res.status(400).json({
                success: false,
                message: "Product ID and valid quantity are required"
            });
        }

        const product = await prisma.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                stock: true,
                name: true
            }
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        if (product.stock < quantity) {
            return res.status(400).json({
                success: false,
                message: `Insufficient stock. Available: ${product.stock}`
            });
        }

        const existingCartItem = await prisma.cart.findFirst({
            where: { user_id: userId, product_id: productId }
        });

        let cartItem: any;

        if (existingCartItem) {
            cartItem = await prisma.cart.update({
                where: { id: existingCartItem.id },
                data: { quantity: { increment: quantity }, updated_at: new Date() },
                include: {
                    product: {
                        select: { name: true, img: true, price: true }
                    }
                }
            });
        } else {
            cartItem = await prisma.cart.create({
                data: { user_id: userId, product_id: productId, quantity },
                include: {
                    product: {
                        select: { name: true, img: true, price: true }
                    }
                }
            });
        }

        return res.json({
            success: true,
            message: "Added to cart",
            data: cartItem
        });

    } catch (error) {
        console.error("[addToCart] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to add to cart"
        });
    }
};

export const updateCartItem = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const itemId = Number(req.params.id);
        const { quantity } = req.body;

        if (!itemId || isNaN(itemId) || quantity === undefined || quantity < 0) {
            return res.status(400).json({
                success: false,
                message: "Valid item ID and quantity are required"
            });
        }

        if (quantity === 0) {

            await prisma.cart.delete({
                where: { id: itemId, user_id: userId }
            });

            return res.json({
                success: true,
                message: "Item removed from cart"
            });
        }

        const cartItem = await prisma.cart.findUnique({
            where: { id: itemId, user_id: userId },
            include: {
                product: {
                    select: {
                        stock: true
                    }
                }
            }
        });

        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: "Cart item not found"
            });
        }

        if (cartItem.product.stock < quantity) {
            return res.status(400).json({
                success: false,
                message: `Insufficient stock. Available: ${cartItem.product.stock}`
            });
        }

        const updatedItem = await prisma.cart.update({
            where: { id: itemId, user_id: userId },
            data: {
                quantity: quantity,
                updated_at: new Date()
            },
            include: {
                product: {
                    select: {
                        name: true,
                        img: true,
                        price: true
                    }
                }
            }
        });

        return res.json({
            success: true,
            message: "Cart updated",
            data: updatedItem
        });

    } catch (error) {
        console.error("[updateCartItem] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update cart"
        });
    }
};

export const clearCart = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;

        await prisma.cart.deleteMany({
            where: { user_id: userId }
        });

        return res.json({
            success: true,
            message: "Cart cleared"
        });

    } catch (error) {
        console.error("[clearCart] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to clear cart"
        });
    }
};

export const getMyWishlist = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;

        const wishlistItems = await prisma.wishlist.findMany({
            where: { user_id: userId },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        img: true,
                        price: true,
                        stock: true,
                    }
                }
            }
        });

        return res.json({
            success: true,
            data: wishlistItems
        });

    } catch (error) {
        console.error("[getMyWishlist] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch wishlist"
        });
    }
};

export const toggleWishlist = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "Product ID is required"
            });
        }

        const existing = await prisma.wishlist.findFirst({
            where: { user_id: userId, product_id: productId }
        });

        if (existing) {

            await prisma.wishlist.delete({
                where: { id: existing.id }
            });

            return res.json({
                success: true,
                message: "Removed from wishlist",
                inWishlist: false
            });
        } else {

            await prisma.wishlist.create({
                data: {
                    user_id: userId,
                    product_id: productId
                }
            });

            return res.json({
                success: true,
                message: "Added to wishlist",
                inWishlist: true
            });
        }

    } catch (error) {
        console.error("[toggleWishlist] Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update wishlist"
        });
    }
};