import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';

@Controller('users')
export class UsersController {

    @Get() // GET /users or /users?role=value (Query parameter)
    findAll(@Query('role') role?: 'ADMIN' | 'BROKERAGE' | 'VIEWER' | 'INSPECTOR' | 'GOVOFFICIAL') {
        return []
    }

    @Get(':id') // GET /users/:id
    findOne(@Query('id') id: string) {
        return {id}
    }

    @Post() // POST /users
    create(@Body() user: {}) {
        return {user}
    }

    @Patch(':id') // PATCH /users/:id
    update(@Param('id') id: string, @Body() userUpdate: {}) {
        return {userUpdate}
    }

    @Delete(':id') // DELETE /users/:id
    delete(@Param('id') id: string) {
        return {id}
    }
}
