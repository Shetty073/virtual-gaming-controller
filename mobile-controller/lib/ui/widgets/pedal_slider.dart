import 'package:flutter/material.dart';

class PedalSlider extends StatelessWidget {
  final String label;
  final double value; // 0.0 to 1.0
  final ValueChanged<double> onChanged;
  final Color activeColor;
  final IconData icon;

  const PedalSlider({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    required this.activeColor,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onVerticalDragUpdate: (details) {
        // Dragging upward increases pressure
        final delta = -details.primaryDelta! / 180.0;
        final newVal = (value + delta).clamp(0.0, 1.0);
        onChanged(newVal);
      },
      onVerticalDragEnd: (_) {
        // Release spring return
        onChanged(0.0);
      },
      onTapDown: (_) => onChanged(1.0),
      onTapUp: (_) => onChanged(0.0),
      onTapCancel: () => onChanged(0.0),
      child: Container(
        width: 80,
        height: 200,
        decoration: BoxDecoration(
          color: const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: activeColor.withValues(alpha: 0.4), width: 2),
          boxShadow: [
            BoxShadow(
              color: value > 0 ? activeColor.withValues(alpha: 0.3) : Colors.transparent,
              blurRadius: 16,
            )
          ],
        ),
        child: Stack(
          alignment: Alignment.bottomCenter,
          children: [
            // Pressure Fill Bar
            AnimatedContainer(
              duration: const Duration(milliseconds: 30),
              width: double.infinity,
              height: 200 * value,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [
                    activeColor,
                    activeColor.withValues(alpha: 0.6),
                  ],
                ),
              ),
            ),

            // Top Pedal Info
            Positioned(
              top: 14,
              child: Column(
                children: [
                  Icon(icon, color: Colors.white, size: 24),
                  const SizedBox(height: 4),
                  Text(
                    label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${(value * 100).toInt()}%',
                    style: TextStyle(
                      color: activeColor,
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
