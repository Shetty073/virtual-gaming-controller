import 'package:flutter/material.dart';
import 'ui/screens/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const VirtualControllerApp());
}

class VirtualControllerApp extends StatelessWidget {
  const VirtualControllerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Virtual Gaming Controller',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF030712),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF00F0FF),
          secondary: Color(0xFF00FF66),
          surface: Color(0xFF0F172A),
        ),
      ),
      home: const HomeScreen(),
    );
  }
}
