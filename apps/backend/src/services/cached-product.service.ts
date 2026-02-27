import { logger } from "../utils/logger";
import { CacheService } from "./cache.service";
import { CreateProductData, UpdateProductData, PaginatedResult } from "./product.service";

export class CachedProductService {
  private productService: any; // Original product service
  private cache: CacheService;

  constructor() {
    // Import the original product service
    const { ProductService } = require("./product.service");
    this.productService = new ProductService();
    this.cache = new CacheService('./cache_products.db'); // Separate cache DB for products
  }

  async getAllProducts(page: number = 1, limit: number = 10, sortBy: string = 'id', sortOrder: 'asc' | 'desc' = 'asc'): Promise<PaginatedResult<any>> {
    const cacheKey = `products:${page}:${limit}:${sortBy}:${sortOrder}`;

    // Try to get from cache first
    let result = await this.cache.get(cacheKey);
    
    if (result) {
      logger.info(`Cache hit for ${cacheKey}`);
      return result;
    }

    logger.info(`Cache miss for ${cacheKey}, fetching from database`);
    
    // If not in cache, get from the original service
    result = await this.productService.getAllProducts(page, limit, sortBy, sortOrder);
    
    // Store in cache with TTL of 5 minutes
    await this.cache.set(cacheKey, result, 5 * 60); // 5 minutes in seconds
    
    return result;
  }

  async getProductById(id: number) {
    const cacheKey = `product:${id}`;

    // Try to get from cache first
    let product = await this.cache.get(cacheKey);
    
    if (product) {
      logger.info(`Cache hit for ${cacheKey}`);
      return product;
    }

    logger.info(`Cache miss for ${cacheKey}, fetching from database`);
    
    // If not in cache, get from the original service
    product = await this.productService.getProductById(id);
    
    // Store in cache with TTL of 10 minutes
    await this.cache.set(cacheKey, product, 10 * 60); // 10 minutes in seconds
    
    return product;
  }

  async createProduct(productData: CreateProductData) {
    // Clear relevant cache entries when creating a new product
    await this.clearProductCache();
    
    // Call the original service
    const result = await this.productService.createProduct(productData);
    
    return result;
  }

  async updateProduct(id: number, productData: UpdateProductData) {
    // Clear relevant cache entries when updating a product
    await this.clearProductCache();
    await this.cache.delete(`product:${id}`); // Also clear specific product cache
    
    // Call the original service
    const result = await this.productService.updateProduct(id, productData);
    
    return result;
  }

  async deleteProduct(id: number) {
    // Clear relevant cache entries when deleting a product
    await this.clearProductCache();
    await this.cache.delete(`product:${id}`); // Also clear specific product cache
    
    // Call the original service
    const result = await this.productService.deleteProduct(id);
    
    return result;
  }

  private async clearProductCache() {
    // For simplicity, we'll clear all product caches
    // In a real application, you might want to be more selective
    await this.cache.clear();
  }
}