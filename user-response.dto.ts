import { Role } from "@prisma/client";
import { Exclude, Expose } from "class-transformer";

@Exclude()
export class UserResponseDto {
    @Expose()
    id: number;

    @Expose()
    email: string;

    @Expose()
    role: Role;

    @Expose()
    createdAt?: Date;

    @Expose()
    updatedAt?: Date;

    constructor(partial: Partial<UserResponseDto>) {
        Object.assign(this, partial);
    }
}
