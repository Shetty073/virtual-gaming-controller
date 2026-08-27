import 'package:flutter/material.dart';
import '../../core/models/controller_models.dart';

class GameControlButton extends StatelessWidget {
  final ControlButton button;
  final VoidCallback onPressed;
  final VoidCallback? onReleased;

  const GameControlButton({
    super.key,
    required this.button,
    required this.onPressed,
    this.onReleased,
  });

  IconData _getIconData(String iconName) {
    switch (iconName) {
      case 'power_settings_new':
        return Icons.power_settings_new_rounded;
      case 'pan_tool':
        return Icons.front_hand_rounded;
      case 'arrow_back':
        return Icons.arrow_back_rounded;
      case 'arrow_forward':
        return Icons.arrow_forward_rounded;
      case 'warning':
        return Icons.warning_rounded;
      case 'wb_incandescent':
        return Icons.lightbulb_rounded;
      case 'highlight':
        return Icons.highlight_rounded;
      case 'volume_up':
        return Icons.volume_up_rounded;
      case 'campaign':
        return Icons.campaign_rounded;
      case 'water_drop':
        return Icons.water_drop_rounded;
      case 'speed':
        return Icons.speed_rounded;
      case 'keyboard_arrow_up':
        return Icons.keyboard_arrow_up_rounded;
      case 'keyboard_arrow_down':
        return Icons.keyboard_arrow_down_rounded;
      case 'lock':
        return Icons.lock_rounded;
      case 'meeting_room':
        return Icons.meeting_room_rounded;
      case 'door_sliding':
        return Icons.door_sliding_rounded;
      case 'light_mode':
        return Icons.light_mode_rounded;
      case 'airline_seat_recline_extra':
        return Icons.airline_seat_recline_extra_rounded;
      case 'luggage':
        return Icons.luggage_rounded;
      default:
        return Icons.touch_app_rounded;
    }
  }

  // Get dynamic illumination color based on button state and multi-stage phase
  Color _getActiveColor() {
    if (button.type == 'multi_stage') {
      switch (button.stage) {
        case 1:
          return const Color(0xFFE2E8F0); // Stage 1: Crisp White
        case 2:
          return const Color(0xFFFFAA00); // Stage 2: Amber
        case 3:
          return const Color(0xFF00FF66); // Stage 3: Green
        default:
          return const Color(0xFF64748B); // Off
      }
    }

    if (button.id == 'btn_hazard' && button.isToggled) {
      return const Color(0xFFFF0055); // Hazards: Vibrant Flashing Red/Crimson
    }

    if (button.id.contains('blinker') && button.isToggled) {
      return const Color(0xFFFFAA00); // Turn indicators: Amber
    }

    if (button.isToggled || button.isPressed) {
      return const Color(0xFF00F0FF); // Default Active: Neon Cyan
    }

    return const Color(0xFF64748B);
  }

  @override
  Widget build(BuildContext context) {
    final bool isLit = (button.type == 'multi_stage' && button.stage > 0) ||
        button.isToggled ||
        button.isPressed;
    final Color activeColor = _getActiveColor();

    return GestureDetector(
      onTapDown: (_) => onPressed(),
      onTapUp: (_) => onReleased?.call(),
      onTapCancel: () => onReleased?.call(),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        decoration: BoxDecoration(
          color: isLit
              ? activeColor.withValues(alpha: 0.18)
              : const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isLit ? activeColor : const Color(0xFF334155),
            width: isLit ? 2.0 : 1.2,
          ),
          boxShadow: [
            if (isLit)
              BoxShadow(
                color: activeColor.withValues(alpha: 0.35),
                blurRadius: 12,
                spreadRadius: 1,
              )
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              _getIconData(button.icon),
              color: isLit ? activeColor : const Color(0xFF94A3B8),
              size: 20,
            ),
            const SizedBox(height: 3),
            Text(
              button.label,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: isLit ? Colors.white : const Color(0xFFCBD5E1),
                fontSize: 8.5,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (button.type == 'multi_stage') ...[
              const SizedBox(height: 2),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(button.maxStages, (index) {
                  final dotActive = button.stage > index;
                  return Container(
                    margin: const EdgeInsets.symmetric(horizontal: 1.5),
                    width: 4,
                    height: 4,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: dotActive ? activeColor : const Color(0xFF334155),
                    ),
                  );
                }),
              )
            ]
          ],
        ),
      ),
    );
  }
}
