import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import { firstValueFrom } from 'rxjs';

export interface ProductResponse {
  id: string;
  name: string;
  price: number;
  stock: number;
  isActive: boolean;
  sellerId: string;
}

@Injectable()
export class ProductsClientService {
  constructor(private readonly httpService: HttpService) {}

  async findById(productId: string): Promise<ProductResponse> {
    const url = `${process.env.PRODUCTS_SERVICE_URL}/products/${productId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<ProductResponse>(url),
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException('Produto não encontrado');
      }

      throw new ServiceUnavailableException(
        'Serviço de produtos indisponível',
      );
    }
  }
}
