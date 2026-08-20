import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  create(dto: CreateProductDto, sellerId: string, role: string) {
    if (role !== 'seller') {
      throw new ForbiddenException(
        'Apenas vendedores podem cadastrar produtos',
      );
    }

    const product = this.productsRepository.create({
      ...dto,
      sellerId,
      isActive: true,
    });

    return this.productsRepository.save(product);
  }

  findAllActive() {
    return this.productsRepository.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  findBySeller(sellerId: string) {
    return this.productsRepository.find({
      where: { isActive: true, sellerId },
    });
  }

  async findOne(id: string) {
    const product = await this.productsRepository.findOne({ where: { id } });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    return product;
  }
}
