Please see the [C# vs. C++ for Native Modules](#c-vs-c-for-native-modules) note for more information about which to choose. 

> NOTE: If you are unable to use the reflection-based annotation approach.

## C# vs. C++ for Native Modules

Although React Native for Windows supports writing modules in both C# and C++, you should be aware that your choice of language could impact performance of apps that consume your module. Modules written in C# rely on the CLR. At app launch, if there are _any_ C# dependencies, the app will load the CLR which will increase the launch time for the application. Note that this is a one-time cost regardless of the number of C# dependencies that your app relies on.

That said, we recognize the engineering efficiency that comes with writing a module in C#. We strive to maintain parity in developer experience between C# and C++. If your app or module already uses C# (perhaps because it is migrating from the React Native for Windows legacy platform), you should feel empowered to continue to use C#. That said, modules that Microsoft contributes to will be written in C++ to ensure the highest level of performance. 

- [Desktop/React.Windows.Desktop.vcxproj](#React.Windows.Desktop)

## React.Windows.Desktop

this is something