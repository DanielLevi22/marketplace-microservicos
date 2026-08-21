import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosError, type AxiosResponse } from 'axios';
import { ProductsClientService } from './products-client.service';

describe('ProductsClientService', () => {
  const originalUrl = process.env.PRODUCTS_SERVICE_URL;
  let httpService: { get: jest.Mock };
  let service: ProductsClientService;

  beforeAll(() => {
    process.env.PRODUCTS_SERVICE_URL = 'http://products-service:3001';
  });

  afterAll(() => {
    process.env.PRODUCTS_SERVICE_URL = originalUrl;
  });

  beforeEach(() => {
    httpService = { get: jest.fn() };
    service = new ProductsClientService(httpService as unknown as HttpService);
  });

  function axiosError(status?: number): AxiosError {
    const error = new AxiosError('request failed');
    if (status !== undefined) {
      error.response = { status } as AxiosResponse;
    }
    return error;
  }

  it('calls products-service using PRODUCTS_SERVICE_URL and returns the product', async () => {
    const product = {
      id: 'product-1',
      name: 'Mouse',
      price: 29.9,
      stock: 10,
      isActive: true,
      sellerId: 'seller-1',
    };
    httpService.get.mockReturnValue(of({ data: product } as AxiosResponse));

    const result = await service.findById('product-1');

    expect(httpService.get).toHaveBeenCalledWith(
      'http://products-service:3001/products/product-1',
    );
    expect(result).toEqual(product);
  });

  it('throws NotFoundException when products-service responds 404', async () => {
    httpService.get.mockReturnValue(throwError(() => axiosError(404)));

    await expect(service.findById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws ServiceUnavailableException on a non-404 error response', async () => {
    httpService.get.mockReturnValue(throwError(() => axiosError(500)));

    await expect(service.findById('product-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException when there is no response (network failure)', async () => {
    httpService.get.mockReturnValue(throwError(() => axiosError()));

    await expect(service.findById('product-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
