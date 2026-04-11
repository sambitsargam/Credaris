// The 'test_credaris_lending_v10' test program.
import credaris_lending_v10.aleo;
program test_credaris_lending_v10.aleo {
    @test
    @should_fail
    fn test_main_fails() {
        let result: u32 = credaris_lending_v10.aleo::main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    constructor() {}
}
