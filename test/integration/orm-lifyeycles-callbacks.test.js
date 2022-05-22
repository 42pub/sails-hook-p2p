describe('ORM lifecycles callbacks', function () {
    this.timeout(50000)

    /**
     * Создает запись на локальном серевере
     * и в ответ получает обновленную записаь с удаленного сервера
     * тем самым тестируется afterCreate и afterUpdate
     */
    it('afterCreate ping pong', async () => {
        this.timeout(50000)
        await sleep(6000)
        console.log(11111,sails.hooks.p2p.mesh)
    });


    it('afterDestroy from remote', async () => {
        this.timeout(50000)
        await sleep(3000)
    });
});
