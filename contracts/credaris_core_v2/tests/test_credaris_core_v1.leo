// The 'test_credaris_core_v1' test program.
import credaris_core_v1.aleo;
program test_credaris_core_v1.aleo {
    @test
    @should_fail
    fn test_main_fails() {
        let result: u32 = credaris_core_v1.aleo::main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    constructor() {}
}
