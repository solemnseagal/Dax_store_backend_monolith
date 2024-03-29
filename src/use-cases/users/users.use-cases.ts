import {
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotAcceptableException,
  NotFoundException,
} from '@nestjs/common';
import { UserMapper } from '../../domain/mappers/User.mapper';
import { UserEntity } from '../../domain/entities/users/user.entity';
import { CreateUserDto } from '../../domain/dtos/users/createUser.dto';
import { Result } from '@app/common/domain/result';
import { UserDTO, WithPassword } from '../../domain/dtos/users/user.dto';
import { plainToInstance } from 'class-transformer';
import { UserDocument } from '../../infrastructure/data-services/mongo/model/user-model/user.model';
import { GetUsersQueryDTO } from '../../domain/dtos/users/getUserQuery.dto';
import { IDataServices } from '../../domain/abstracts';

@Injectable()
export class UsersUseCases {
  constructor(
    private dataServices: IDataServices,
    protected readonly userMapper: UserMapper,
  ) {}

  /**
   *
   * @param props takes in dto
   * @returns returns response dto
   */
  async createUser(props: CreateUserDto): Promise<Result<UserDTO>> {
    // Email exist has already been handled at the validation constraint level for createDTO. Please do not remove that constraint there without implementing such validation check here.

    // create an entity from createUserDto
    const user = UserEntity.create({
      ...props,
      isVerified: false,
      roles: ['user'],
    } as Omit<UserDTO, 'id'>).getValue();

    // map the created entity to product-user-model
    const userDoc = this.userMapper.toModelData(user);

    // use the product-user-model to make request to repository
    const result = await this.dataServices.users.create(
      userDoc as UserDocument,
    );

    // filter off the password with class transformer and make it into UserDTO, the form in which clients should get data
    const serializedUser = plainToInstance(UserDTO, result.getValue(), {
      excludeExtraneousValues: true,
    });
    return Result.ok(serializedUser);
  }

  /**
   *
   * @param query
   * @returns filtered users or all users
   */

  async getUsers(query?: GetUsersQueryDTO | null): Promise<Result<any>> {
    const { limit, currentPage, firstname, lastname, email } = query;
    let pageCount: number;

    const currPage = Number(currentPage) || 1;
    const responsePerPage = Number(limit) || undefined;
    const skip = responsePerPage * (currPage - 1);

    const filterObj = {
      ...(lastname && {
        lastname:
          lastname.trim().charAt(0).toUpperCase() + lastname.trim().slice(1),
      }),
      ...(firstname && {
        firstname:
          firstname.trim().charAt(0).toUpperCase() + firstname.trim().slice(1),
      }),
      ...(email && { email: email }),
    };

    const itemCount = (
      await this.dataServices.users.getCount(filterObj)
    ).getValue();

    if (limit) {
      pageCount = Math.ceil((itemCount as number) / limit);
    }

    // offset it by the pagecount if requested page from client is greater than pagecount
    const offset =
      Number(currPage) > Number(pageCount)
        ? responsePerPage * (Number(pageCount) - 1)
        : skip;

    const users = await this.dataServices.users.findAll(filterObj, null, {
      limit: responsePerPage,
      ...(limit && { skip: offset }),
    });

    const serializedUser = users.getValue().map((user) => {
      return plainToInstance(
        UserDTO,
        {
          ...user,
          ...{ isVerified: Boolean(user.isVerified) },
        },
        { excludeExtraneousValues: true },
      );
    });

    return Result.ok({
      users: [...serializedUser],
      pageCount,
      itemCount,
      ...{
        page: currPage,
        isNext: Number(currPage) < Number(pageCount),
        isPrevious: Number(currPage) > 1,
        nextPage: Number(currPage) < Number(pageCount) && currPage + 1,
        previousPage: Number(currPage) > 1 && currPage - 1,
      },
    });
  }

  async getOneUserById(id: string): Promise<Result<UserDTO>> {
    try {
      const user = await this.dataServices.users.findById(id);

      // can't directly spread user.getvalue() because an instance of entity was created and returned from the findById method with public getters and setters that can be used to access properties
      const serializedUser = plainToInstance(
        UserDTO,
        {
          ...user.getValue(),
          ...{ isVerified: Boolean(user.getValue().isVerified) },
        },

        { excludeExtraneousValues: true },
      );

      return Result.ok(serializedUser);
    } catch (err) {
      if (err instanceof NotAcceptableException || NotFoundException) {
        return Result.fail('No such user exists', HttpStatus.NOT_FOUND);
      } else {
        throw new InternalServerErrorException('Something went wrong');
      }
    }
  }

  async getOneUserByEmail(
    email: string,
    safe = true,
  ): Promise<Result<UserDTO | WithPassword>> {
    try {
      const userResult = await this.dataServices.users.findByValues({
        email: email,
      });

      if (!userResult.isSuccess) {
        throw new NotFoundException();
      }
      if (safe) {
        const serializedUser = plainToInstance(
          UserDTO,
          {
            ...userResult,
            ...{ isVerified: Boolean(userResult.getValue().isVerified) },
          },

          { excludeExtraneousValues: true },
        );

        return Result.ok(serializedUser);
      }
      return Result.ok(plainToInstance(WithPassword, userResult.getValue()));
    } catch (err) {
      if (err instanceof NotAcceptableException) {
        return Result.fail(
          'Format is not acceptable',
          HttpStatus.NOT_ACCEPTABLE,
        );
      }
      if (err instanceof NotFoundException) {
        return Result.fail('No such user exists', HttpStatus.NOT_FOUND);
      } else {
        throw new InternalServerErrorException('Something went wrong');
      }
    }
  }
}
